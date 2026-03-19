require "fileutils"
require "shellwords"
require_relative "config"
require_relative "db"
require_relative "repo_cache"

class WorkspaceManager
  attr_reader :workspace_path, :repo_names

  def initialize(repo_names, job_id, run_number)
    @repo_names = repo_names
    @workspace_path = File.join(Config::WORK_DIR, "job-#{job_id}-run-#{run_number}")
    @cache = RepoCache.new
  end

  # Clone all repos from cache into the workspace as sibling directories.
  # Layout: /tmp/bugfixvibe/job-1-run-1/cartoon_maker/
  def setup
    FileUtils.rm_rf(@workspace_path) if Dir.exist?(@workspace_path)
    FileUtils.mkdir_p(@workspace_path)

    @repo_names.each do |repo_name|
      @cache.ensure_cached(repo_name)
      short_name = repo_name.split("/").last
      dest = File.join(@workspace_path, short_name)
      @cache.clone_from_cache(repo_name, dest)
    end

    puts "[WorkspaceManager] Workspace ready: #{@workspace_path}"
    puts "[WorkspaceManager] Repos: #{@repo_names.join(', ')}"
  end

  # Create or checkout a branch in all repos.
  # If the branch already exists on remote (follow-up run), check it out to build on previous commits.
  # Otherwise, create a new branch from the configured base branch.
  def create_branches(branch_name)
    each_repo_dir do |dir, name|
      full_name = @repo_names.find { |r| r.split("/").last == name }
      base_branch = DB.get_repo_branch(full_name)

      # Check if branch exists on remote (from a previous run)
      remote_ref = `git -C #{dir.shellescape} ls-remote --heads origin #{branch_name} 2>/dev/null`.strip
      if !remote_ref.empty?
        # Follow-up: checkout existing branch with previous commits
        system("git", "-C", dir, "fetch", "origin", branch_name, exception: true)
        system("git", "-C", dir, "checkout", "-b", branch_name, "origin/#{branch_name}", exception: true)
        puts "[WorkspaceManager] Checked out existing branch #{branch_name} for #{name}"
      else
        # First run: create new branch from base
        system("git", "-C", dir, "checkout", base_branch, exception: true)
        system("git", "-C", dir, "checkout", "-b", branch_name, exception: true)
        puts "[WorkspaceManager] Created new branch #{branch_name} for #{name}"
      end
    end
  end

  # Returns array of repo short names that have uncommitted changes.
  def detect_changed_repos
    changed = []
    each_repo_dir do |dir, name|
      status = `git -C #{dir.shellescape} status --porcelain`.strip
      changed << name unless status.empty?
    end
    changed
  end

  # Concatenated diff across all changed repos for LLM consumption.
  def aggregate_diff_for_llm
    parts = []
    each_repo_dir do |dir, name|
      esc = dir.shellescape
      stat = `git -C #{esc} diff --cached --stat 2>/dev/null`.strip
      patch = `git -C #{esc} diff --cached 2>/dev/null`
      if stat.empty?
        stat = `git -C #{esc} diff --stat 2>/dev/null`.strip
        patch = `git -C #{esc} diff 2>/dev/null`
      end
      next if stat.empty? && patch.strip.empty?

      truncated = patch.lines.first(150).join
      parts << "=== #{name} ===\n#{stat}\n---\n#{truncated}"
    end
    parts.join("\n\n")
  end

  # Yields [repo_dir, short_name] for each repo in the workspace.
  def each_repo_dir(&block)
    @repo_names.each do |repo_name|
      short_name = repo_name.split("/").last
      dir = File.join(@workspace_path, short_name)
      next unless Dir.exist?(dir)
      block.call(dir, short_name)
    end
  end

  def cleanup
    FileUtils.rm_rf(@workspace_path) if Dir.exist?(@workspace_path)
  end
end
