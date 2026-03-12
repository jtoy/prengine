require "fileutils"
require_relative "config"
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

  # Create a branch in all repos.
  def create_branches(branch_name)
    each_repo_dir do |dir, _name|
      Dir.chdir(dir) do
        system("git", "checkout", "-b", branch_name, exception: true)
      end
    end
  end

  # Returns array of repo short names that have uncommitted changes.
  def detect_changed_repos
    changed = []
    each_repo_dir do |dir, name|
      Dir.chdir(dir) do
        status = `git status --porcelain`.strip
        changed << name unless status.empty?
      end
    end
    changed
  end

  # Concatenated diff across all changed repos for LLM consumption.
  def aggregate_diff_for_llm
    parts = []
    each_repo_dir do |dir, name|
      Dir.chdir(dir) do
        stat = `git diff --cached --stat 2>/dev/null`.strip
        patch = `git diff --cached 2>/dev/null`
        if stat.empty?
          stat = `git diff --stat 2>/dev/null`.strip
          patch = `git diff 2>/dev/null`
        end
        next if stat.empty? && patch.strip.empty?

        truncated = patch.lines.first(150).join
        parts << "=== #{name} ===\n#{stat}\n---\n#{truncated}"
      end
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
