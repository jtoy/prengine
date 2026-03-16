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
end
