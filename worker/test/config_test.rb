require_relative "test_helper"

class ConfigTest < Minitest::Test
  def test_database_url_is_set
    assert_equal ENV["DATABASE_URL"], Config::DATABASE_URL
  end

  def test_redis_url_has_default
    refute_nil Config::REDIS_URL
  end

  def test_github_token_is_set
    assert_equal "test-github-token", Config::GITHUB_TOKEN
  end

  def test_repos_parsed_as_array
    assert_kind_of Array, Config::REPOS
    assert Config::REPOS.length >= 1
  end

  def test_repos_are_trimmed
    Config::REPOS.each do |repo|
      assert_equal repo.strip, repo
    end
  end

  def test_work_dir_has_default
    refute_nil Config::WORK_DIR
    refute Config::WORK_DIR.empty?
  end

  def test_max_concurrency_is_integer
    assert_kind_of Integer, Config::MAX_CONCURRENCY
    assert Config::MAX_CONCURRENCY > 0
  end

  def test_llm_provider_has_default
    assert_includes ["ollama", "anthropic"], Config::LLM_PROVIDER
  end

  def test_queue_key
    assert_equal "bugfixvibe:jobs", Config::QUEUE_KEY
  end

  def test_status_channel
    assert_equal "bugfixvibe:status", Config::STATUS_CHANNEL
  end

  def test_cache_dir_is_under_work_dir
    assert Config::CACHE_DIR.start_with?(Config::WORK_DIR)
  end

  def test_repo_descriptions_is_hash
    assert_kind_of Hash, Config::REPO_DESCRIPTIONS
  end
end
