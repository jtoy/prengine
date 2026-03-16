require_relative "test_helper"
require_relative "../workspace_manager"

class WorkspaceManagerTest < Minitest::Test
  def test_initialize_sets_workspace_path
    wm = WorkspaceManager.new(["owner/repo1"], 1, 1)
    assert_includes wm.workspace_path, "job-1-run-1"
  end

  def test_initialize_stores_repo_names
    repos = ["owner/repo1", "owner/repo2"]
    wm = WorkspaceManager.new(repos, 5, 2)
    assert_equal repos, wm.repo_names
  end

  def test_each_repo_dir_yields_for_existing_dirs
    tmp_dir = "/tmp/prengine-ws-test-#{$$}"
    repos = ["owner/app"]
    wm = WorkspaceManager.new(repos, 99, 1)

    # Manually create workspace dir structure
    repo_dir = File.join(wm.workspace_path, "app")
    FileUtils.mkdir_p(repo_dir)

    yielded = []
    wm.each_repo_dir { |dir, name| yielded << [dir, name] }

    assert_equal 1, yielded.length
    assert_equal "app", yielded[0][1]
    assert_equal repo_dir, yielded[0][0]
  ensure
    FileUtils.rm_rf(wm.workspace_path)
  end

  def test_each_repo_dir_skips_nonexistent
    repos = ["owner/missing"]
    wm = WorkspaceManager.new(repos, 100, 1)

    yielded = []
    wm.each_repo_dir { |dir, name| yielded << name }

    assert_empty yielded
  end

  def test_cleanup_removes_workspace
    repos = ["owner/repo"]
    wm = WorkspaceManager.new(repos, 101, 1)
    FileUtils.mkdir_p(wm.workspace_path)
    assert Dir.exist?(wm.workspace_path)

    wm.cleanup
    refute Dir.exist?(wm.workspace_path)
  end
end
