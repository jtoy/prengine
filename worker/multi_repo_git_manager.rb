require "octokit"
require "shellwords"
require "open3"
require_relative "config"
require_relative "db"
require_relative "workspace_manager"
require_relative "branch_resolver"

class MultiRepoGitManager
  attr_reader :branch_name, :workspace

  def initialize(repo_names, job_id, run_number)
    @repo_names = repo_names
    @job_id = job_id
    @run_number = run_number
    @branch_name = "bugfix/job-#{job_id}"
    @workspace = WorkspaceManager.new(repo_names, job_id, run_number)
    @client = Octokit::Client.new(access_token: Config::GITHUB_TOKEN)
    @changed_repos = []
  end

  # Returns the workspace root path (parent of all repos).
  def work_path
    @workspace.workspace_path
  end

  # Clone all repos from cache + create branches.
  def setup_workspace
    @workspace.setup
    @workspace.create_branches(@branch_name)
  end

  # Aggregate diff across all repos for LLM consumption.
  def diff_for_llm
    @workspace.aggregate_diff_for_llm
  end

  # Detect changed repos, stage + commit each. Returns { short_name => sha }.
  def commit_all(message)
    @changed_repos = @workspace.detect_changed_repos
    results = {}

    @workspace.each_repo_dir do |dir, name|
      next unless @changed_repos.include?(name)
      esc = dir.shellescape

      # Reset index: the agent may have staged files (including node_modules)
      # during its session. We unstage everything and re-add selectively.
      `git -C #{esc} reset HEAD -- . 2>/dev/null`

      # Stage only files the agent actually touched:
      # 1. Modified/deleted tracked files
      modified = `git -C #{esc} diff --name-only`.strip.split("\n").reject(&:empty?)
      # 2. New files that pass the repo's own .gitignore
      untracked = `git -C #{esc} ls-files --others --exclude-standard`.strip.split("\n").reject(&:empty?)

      files_to_add = modified + untracked
      next if files_to_add.empty?

      files_to_add.each { |f| system("git", "-C", dir, "add", "--", f) }

      # Also stage any deletions
      deleted = `git -C #{esc} diff --name-only --diff-filter=D`.strip.split("\n").reject(&:empty?)
      deleted.each { |f| system("git", "-C", dir, "rm", "--cached", "--", f, exception: false) }

      status = `git -C #{esc} status --porcelain`.strip
      next if status.empty?

      _out, err, st = Open3.capture3("git", "-C", dir, "commit", "-m", message)
      raise "git commit failed for #{name}: #{err}" unless st.success?
      sha = `git -C #{esc} rev-parse HEAD`.strip
      results[name] = sha
      puts "[MultiRepoGitManager] Committed #{name}: #{sha} (#{files_to_add.size} files)"
    end

    # Update changed_repos to only those that actually committed
    @changed_repos = results.keys
    results
  end

  # Diff summary per changed repo (stat).
  def diff_summary
    parts = []
    @workspace.each_repo_dir do |dir, name|
      next unless @changed_repos.include?(name)
      stat = `git -C #{dir.shellescape} diff HEAD~1 --stat 2>/dev/null`.strip
      parts << "=== #{name} ===\n#{stat}" unless stat.empty?
    end
    parts.join("\n\n")
  end

  # Set authenticated remote URL and force-push each changed repo.
  def push_all
    @workspace.each_repo_dir do |dir, name|
      next unless @changed_repos.include?(name)

      repo_name = @repo_names.find { |r| r.split("/").last == name }
      next unless repo_name

      auth_url = "https://#{Config::GITHUB_TOKEN}@github.com/#{repo_name}.git"
      _out, err, status = Open3.capture3("git", "-C", dir, "remote", "set-url", "origin", auth_url)
      raise "git remote set-url failed for #{name}: #{err}" unless status.success?

      _out, err, status = Open3.capture3("git", "-C", dir, "push", "--force", "origin", @branch_name)
      raise "git push failed for #{name}: #{err}" unless status.success?

      puts "[MultiRepoGitManager] Pushed #{name}"
    end
  end

  # Create/update a PR per changed repo. Returns [{repo:, url:}].
  def create_prs(title:, body:)
    results = []

    @workspace.each_repo_dir do |dir, name|
      next unless @changed_repos.include?(name)

      repo_name = @repo_names.find { |r| r.split("/").last == name }
      next unless repo_name

      pr_url = create_or_update_pr(repo_name, title, body)
      results << { repo: repo_name, url: pr_url } if pr_url
    end

    results
  end

  def cleanup
    @workspace.cleanup
  end

  private

  def create_or_update_pr(full_repo, title, body)
    owner, _repo = full_repo.split("/")
    base_branch = DB.get_repo_branch(full_repo)

    begin
      pr = @client.create_pull_request(full_repo, base_branch, @branch_name, title, body)
      puts "[MultiRepoGitManager] PR created for #{full_repo}: #{pr.html_url}"
      pr.html_url
    rescue Octokit::UnprocessableEntity => e
      if e.message.include?("already exists")
        puts "[MultiRepoGitManager] PR already exists for #{full_repo}, updating..."
        existing = @client.pull_requests(full_repo, head: "#{owner}:#{@branch_name}", state: "open").first
        if existing
          @client.update_pull_request(full_repo, existing.number, title: title, body: body)
          existing.html_url
        else
          puts "[MultiRepoGitManager] Could not find existing PR for #{full_repo}"
          nil
        end
      else
        puts "[MultiRepoGitManager] PR creation failed for #{full_repo}: #{e.message}"
        nil
      end
    end
  end
end
