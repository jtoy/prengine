require_relative "test_helper"
require_relative "../repo_router"

class RepoRouterTest < Minitest::Test
  def test_returns_all_repos_when_two_or_fewer
    result = RepoRouter.route("Bug title", "Bug summary", ["owner/repo1"])
    assert_equal ["owner/repo1"], result
  end

  def test_returns_all_repos_when_exactly_two
    repos = ["owner/repo1", "owner/repo2"]
    result = RepoRouter.route("Bug", "Desc", repos)
    assert_equal repos, result
  end

  def test_uses_llm_when_more_than_two_repos
    repos = ["owner/frontend", "owner/backend", "owner/shared"]
    DB.expects(:get_repo_descriptions).returns({})
    LLMClient.expects(:generate).returns("owner/frontend\nowner/backend")

    result = RepoRouter.route("CSS bug in header", "The header is misaligned", repos)
    assert_includes result, "owner/frontend"
  end

  def test_falls_back_to_all_when_llm_returns_nil
    repos = ["owner/a", "owner/b", "owner/c"]
    DB.expects(:get_repo_descriptions).returns({})
    LLMClient.expects(:generate).returns(nil)

    result = RepoRouter.route("Bug", "Desc", repos)
    assert_equal repos, result
  end

  def test_falls_back_to_all_when_llm_returns_empty
    repos = ["owner/a", "owner/b", "owner/c"]
    DB.expects(:get_repo_descriptions).returns({})
    LLMClient.expects(:generate).returns("")

    result = RepoRouter.route("Bug", "Desc", repos)
    assert_equal repos, result
  end

  def test_falls_back_when_no_valid_repos_parsed
    repos = ["owner/zx-alpha", "owner/zx-beta", "owner/zx-gamma"]
    DB.expects(:get_repo_descriptions).returns({})
    LLMClient.expects(:generate).returns("some text with no matching repo names")

    result = RepoRouter.route("Bug", "Desc", repos)
    assert_equal repos, result
  end

  def test_parse_repos_matches_by_short_name
    repos = ["org/my-frontend", "org/my-backend"]
    # Using send to test private method
    result = RepoRouter.send(:parse_repos, "- my-frontend\n- my-backend", repos)
    assert_equal repos, result
  end

  def test_parse_repos_matches_by_full_name
    repos = ["org/app"]
    result = RepoRouter.send(:parse_repos, "org/app", repos)
    assert_equal ["org/app"], result
  end

  def test_parse_repos_deduplicates
    repos = ["org/app"]
    result = RepoRouter.send(:parse_repos, "org/app\napp\norg/app", repos)
    assert_equal ["org/app"], result
  end

  def test_parse_repos_strips_bullet_prefixes
    repos = ["org/repo1", "org/repo2"]
    result = RepoRouter.send(:parse_repos, "- org/repo1\n* org/repo2\n• repo1", repos)
    assert_includes result, "org/repo1"
    assert_includes result, "org/repo2"
  end
end
