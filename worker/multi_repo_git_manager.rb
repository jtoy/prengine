require "octokit"
require_relative "config"
require_relative "db"
require_relative "workspace_manager"

class MultiRepoGitManager
  attr_reader :branch_name, :workspace

  def initialize(repo_names, job_id, run_number)
    @repo_names = repo_names
    @job_id = job_id
    @run_number = run_number
    @branch_name = "bugfix/job-#{job_id}-run-#{run_number}"
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

      Dir.chdir(dir) do
        system("git", "add", "-A", exception: true)
        status = `git status --porcelain`.strip
        next if status.empty?

        system("git", "commit", "-m", message, exception: true)
        sha = `git rev-parse HEAD`.strip
        results[name] = sha
        puts "[MultiRepoGitManager] Committed #{name}: #{sha}"
      end
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
      Dir.chdir(dir) do
        stat = `git diff HEAD~1 --stat 2>/dev/null`.strip
        parts << "=== #{name} ===\n#{stat}" unless stat.empty?
      end
    end
    parts.join("\n\n")
  end

  # Set authenticated remote URL and force-push each changed repo.
  def push_all
    @workspace.each_repo_dir do |dir, name|
      next unless @changed_repos.include?(name)

      repo_name = @repo_names.find { |r| r.split("/").last == name }
      next unless repo_name

      Dir.chdir(dir) do
        auth_url = "https://#{Config::GITHUB_TOKEN}@github.com/#{repo_name}.git"
        system("git", "remote", "set-url", "origin", auth_url, exception: true)
        system("git", "push", "--force", "origin", @branch_name, exception: true)
        puts "[MultiRepoGitManager] Pushed #{name}"
      end
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
