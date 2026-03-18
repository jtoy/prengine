require "fileutils"
require_relative "config"

class RepoCache
  CACHE_DIR = Config::CACHE_DIR

  def initialize
    FileUtils.mkdir_p(CACHE_DIR)
  end

  # Ensure a bare clone exists for the given repo (e.g. "jtoy/cartoon_maker").
  # If already cached, fetch latest.
  def ensure_cached(repo_name)
    bare_path = bare_path_for(repo_name)

    if Dir.exist?(bare_path)
      puts "[RepoCache] Fetching updates for #{repo_name}..."
      system("git", "-C", bare_path, "fetch", "--all", "--prune", exception: true)
    else
      puts "[RepoCache] Bare-cloning #{repo_name}..."
      url = authenticated_url(repo_name)
      system("git", "clone", "--bare", url, bare_path, exception: true)
    end

    bare_path
  end

  # Clone from bare cache to destination directory (fast, uses hardlinks).
  def clone_from_cache(repo_name, dest)
    bare_path = bare_path_for(repo_name)
    raise "No cache for #{repo_name} — call ensure_cached first" unless Dir.exist?(bare_path)

    puts "[RepoCache] Local clone #{repo_name} -> #{dest}"
    system("git", "clone", bare_path, dest, exception: true)

    # Set the remote back to the real GitHub URL (for push)
    real_url = "https://github.com/#{repo_name}.git"
    system("git", "-C", dest, "remote", "set-url", "origin", real_url, exception: true)
  end

  private

  def bare_path_for(repo_name)
    # "jtoy/cartoon_maker" -> "jtoy_cartoon_maker.git"
    safe_name = repo_name.gsub("/", "_")
    File.join(CACHE_DIR, "#{safe_name}.git")
  end

  def authenticated_url(repo_name)
    "https://#{Config::GITHUB_TOKEN}@github.com/#{repo_name}.git"
  end
end
