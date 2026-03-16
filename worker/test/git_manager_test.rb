require_relative "test_helper"
require_relative "../git_manager"

class GitManagerTest < Minitest::Test
  def test_initialize_sets_branch_name
    gm = GitManager.new("https://github.com/owner/repo.git", 1, 1)
    assert_equal "bugfix/job-1-run-1", gm.branch_name
  end

  def test_initialize_sets_work_path
    gm = GitManager.new("https://github.com/owner/repo.git", 5, 3)
    assert_includes gm.work_path, "job-5-run-3"
  end

  def test_initialize_stores_repo_url
    url = "https://github.com/owner/repo.git"
    gm = GitManager.new(url, 1, 1)
    assert_equal url, gm.repo_url
  end

  def test_create_pr_extracts_owner_repo
    gm = GitManager.new("https://github.com/myorg/myrepo.git", 1, 1)
    mock_client = mock("octokit")
    mock_pr = mock("pr")
    mock_pr.stubs(:html_url).returns("https://github.com/myorg/myrepo/pull/1")
    mock_client.expects(:create_pull_request).with(
      "myorg/myrepo", "main", "bugfix/job-1-run-1", "Fix bug", "PR body"
    ).returns(mock_pr)
    gm.instance_variable_set(:@client, mock_client)

    result = gm.create_pr(title: "Fix bug", body: "PR body")
    assert_equal "https://github.com/myorg/myrepo/pull/1", result
  end

  def test_create_pr_returns_nil_for_invalid_url
    gm = GitManager.new("not-a-github-url", 1, 1)
    result = gm.create_pr(title: "Fix", body: "body")
    assert_nil result
  end

  def test_create_pr_handles_existing_pr
    gm = GitManager.new("https://github.com/owner/repo.git", 1, 1)
    mock_client = mock("octokit")

    error = Octokit::UnprocessableEntity.new(
      method: "POST",
      url: "https://api.github.com/repos/owner/repo/pulls",
      body: { message: "A pull request already exists" }
    )

    existing_pr = mock("existing_pr")
    existing_pr.stubs(:html_url).returns("https://github.com/owner/repo/pull/5")
    existing_pr.stubs(:number).returns(5)

    mock_client.expects(:create_pull_request).raises(error)
    mock_client.expects(:pull_requests).returns([existing_pr])
    mock_client.expects(:update_pull_request).returns(existing_pr)

    gm.instance_variable_set(:@client, mock_client)
    result = gm.create_pr(title: "Fix", body: "body")
    assert_equal "https://github.com/owner/repo/pull/5", result
  end

  def test_cleanup
    gm = GitManager.new("https://github.com/owner/repo.git", 999, 1)
    FileUtils.mkdir_p(gm.work_path)
    assert Dir.exist?(gm.work_path)

    gm.cleanup
    refute Dir.exist?(gm.work_path)
  end
end
