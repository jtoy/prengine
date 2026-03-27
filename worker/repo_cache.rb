require "fileutils"
require "open3"
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
      # Validate cache isn't corrupted (macOS /tmp cleanup can remove files but keep dirs)
      _out, _err, st = Open3.capture3("git", "-C", bare_path, "rev-parse", "--is-bare-repository")
      unless st.success?
        puts "[RepoCache] Cache corrupted for #{repo_name}, re-cloning..."
        FileUtils.rm_rf(bare_path)
        bare_clone(repo_name, bare_path)
        return bare_path
      end

      puts "[RepoCache] Fetching updates for #{repo_name}..."
      _out, err, st = Open3.capture3("git", "-C", bare_path, "fetch", "origin", "+refs/heads/*:refs/heads/*", "--prune")
      raise "git fetch failed for #{repo_name}: #{err}" unless st.success?
    else
      bare_clone(repo_name, bare_path)
    end

    bare_path
  end

  # Clone from bare cache to destination directory (fast, uses hardlinks).
  def clone_from_cache(repo_name, dest)
    bare_path = bare_path_for(repo_name)
    raise "No cache for #{repo_name} — call ensure_cached first" unless Dir.exist?(bare_path)

    puts "[RepoCache] Local clone #{repo_name} -> #{dest}"
    _out, err, st = Open3.capture3("git", "clone", bare_path, dest)
    raise "git clone from cache failed for #{repo_name}: #{err}" unless st.success?

    # Set the remote back to the real GitHub URL (for push)
    real_url = "https://github.com/#{repo_name}.git"
    _out, err, st = Open3.capture3("git", "-C", dest, "remote", "set-url", "origin", real_url)
    raise "git remote set-url failed for #{repo_name}: #{err}" unless st.success?
  end

  private

  def bare_clone(repo_name, bare_path)
    puts "[RepoCache] Bare-cloning #{repo_name}..."
    url = authenticated_url(repo_name)
    _out, err, st = Open3.capture3("git", "clone", "--bare", url, bare_path)
    raise "git clone --bare failed for #{repo_name}: #{err}" unless st.success?
  end

  def bare_path_for(repo_name)
    # "jtoy/cartoon_maker" -> "jtoy_cartoon_maker.git"
    safe_name = repo_name.gsub("/", "_")
    File.join(CACHE_DIR, "#{safe_name}.git")
  end

  def authenticated_url(repo_name)
    "https://#{Config::GITHUB_TOKEN}@github.com/#{repo_name}.git"
  end
end
