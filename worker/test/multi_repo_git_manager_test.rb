require_relative "test_helper"
require_relative "../multi_repo_git_manager"

class MultiRepoGitManagerTest < Minitest::Test
  def test_initialize_sets_branch_name
    mgr = MultiRepoGitManager.new(["owner/repo1"], 1, 1)
    assert_equal "bugfix/job-1-run-1", mgr.branch_name
  end

  def test_work_path_delegates_to_workspace
    mgr = MultiRepoGitManager.new(["owner/repo1"], 5, 2)
    assert_includes mgr.work_path, "job-5-run-2"
  end

  def test_cleanup_delegates_to_workspace
    mgr = MultiRepoGitManager.new(["owner/repo1"], 200, 1)
    FileUtils.mkdir_p(mgr.work_path)
    assert Dir.exist?(mgr.work_path)

    mgr.cleanup
    refute Dir.exist?(mgr.work_path)
  end

  def test_create_or_update_pr_defaults_to_main
    mgr = MultiRepoGitManager.new(["owner/repo"], 1, 1)
    mock_client = mock("octokit")
    mock_pr = mock("pr")
    mock_pr.stubs(:html_url).returns("https://github.com/owner/repo/pull/10")

    DB.expects(:get_repo_branch).with("owner/repo").returns("main")
    mock_client.expects(:create_pull_request).with(
      "owner/repo", "main", "bugfix/job-1-run-1", "Fix bug", "Body"
    ).returns(mock_pr)

    mgr.instance_variable_set(:@client, mock_client)
    url = mgr.send(:create_or_update_pr, "owner/repo", "Fix bug", "Body")
    assert_equal "https://github.com/owner/repo/pull/10", url
  end

  def test_create_or_update_pr_uses_configured_base_branch
    mgr = MultiRepoGitManager.new(["owner/repo1"], 1, 1)
    mock_client = mock("octokit")
    mock_pr = mock("pr")
    mock_pr.stubs(:html_url).returns("https://github.com/owner/repo1/pull/5")

    DB.expects(:get_repo_branch).with("owner/repo1").returns("dev")
    mock_client.expects(:create_pull_request).with(
      "owner/repo1", "dev", "bugfix/job-1-run-1", "Fix bug", "Body"
    ).returns(mock_pr)

    mgr.instance_variable_set(:@client, mock_client)
    url = mgr.send(:create_or_update_pr, "owner/repo1", "Fix bug", "Body")
    assert_equal "https://github.com/owner/repo1/pull/5", url
  end

  def test_diff_summary_empty_when_no_changes
    mgr = MultiRepoGitManager.new(["owner/repo"], 1, 1)
    # No changed repos by default
    summary = mgr.diff_summary
    assert_equal "", summary
  end
end
