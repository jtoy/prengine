require_relative "test_helper"
require_relative "../agent_runner"

class AgentRunnerTest < Minitest::Test
  def test_build_prompt_single_repo
    runner = AgentRunner.new("/tmp/work", repo_dirs: ["my-app"])
    prompt = runner.send(:build_prompt, "Button click fails")

    assert_includes prompt, "Button click fails"
    assert_includes prompt, "my-app"
    assert_includes prompt, "Navigate into that directory"
  end

  def test_build_prompt_multi_repo
    runner = AgentRunner.new("/tmp/work", repo_dirs: ["frontend", "backend"])
    prompt = runner.send(:build_prompt, "CSS is broken")

    assert_includes prompt, "CSS is broken"
    assert_includes prompt, "frontend, backend"
    assert_includes prompt, "multiple repos"
  end

  def test_build_prompt_no_repos
    runner = AgentRunner.new("/tmp/work")
    prompt = runner.send(:build_prompt, "Fix the thing")

    assert_includes prompt, "Fix the thing"
    assert_includes prompt, "fixing a bug"
  end

  def test_build_prompt_includes_instructions
    runner = AgentRunner.new("/tmp/work")
    prompt = runner.send(:build_prompt, "test")

    assert_includes prompt, "minimal, focused changes"
    assert_includes prompt, "Run any existing tests"
  end

  def test_build_prompt_includes_live_test_db_hint_for_distark
    runner = AgentRunner.new("/tmp/work", repo_names: ["distark/orchestrator"], repo_dirs: ["orchestrator"])
    prompt = runner.send(:build_prompt, "Need data to debug")

    assert_includes prompt, "LIVE_TEST_DB"
    assert_includes prompt, "daily copied Distark database"
  end

  def test_run_passes_live_test_db_for_distark_repo
    runner = AgentRunner.new("/tmp/work", repo_names: ["distark/orchestrator"], repo_dirs: ["orchestrator"])
    ENV["LIVE_TEST_DB"] = "postgres://example/live_test"

    Open3.expects(:capture3).with(
      has_entry("LIVE_TEST_DB", "postgres://example/live_test"),
      "bash",
      "-lc",
      includes("cd /tmp/work")
    ).returns(["ok", "", stub(success?: true, exitstatus: 0)])

    result = runner.run("debug it")
    assert_equal true, result[:success]
  ensure
    ENV.delete("LIVE_TEST_DB")
  end
end
