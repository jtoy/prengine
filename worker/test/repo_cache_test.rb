require_relative "test_helper"
require_relative "../repo_cache"

class RepoCacheTest < Minitest::Test
  def test_initialize_creates_cache_dir
    cache = RepoCache.new
    assert Dir.exist?(Config::CACHE_DIR)
  end

  def test_bare_path_for_converts_slashes
    cache = RepoCache.new
    path = cache.send(:bare_path_for, "owner/my-repo")
    assert_includes path, "owner_my-repo.git"
    assert path.start_with?(Config::CACHE_DIR)
  end

  def test_authenticated_url_includes_token
    cache = RepoCache.new
    url = cache.send(:authenticated_url, "owner/repo")
    assert_includes url, Config::GITHUB_TOKEN
    assert_includes url, "github.com/owner/repo.git"
  end
end
