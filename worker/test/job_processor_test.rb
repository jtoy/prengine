require_relative "test_helper"
require_relative "../job_processor"

class JobProcessorTest < Minitest::Test
  def setup
    @processor = JobProcessor.new
  end

  def test_process_returns_early_when_job_not_found
    DB.expects(:get_job).with(999).returns(nil)

    # Should not raise
    @processor.process({ job_id: 999, type: "new_job" })
  end

  def test_parse_json_field_with_string
    result = @processor.send(:parse_json_field, '["owner/repo1"]')
    assert_equal ["owner/repo1"], result
  end

  def test_parse_json_field_with_array
    arr = ["owner/repo1"]
    result = @processor.send(:parse_json_field, arr)
    assert_equal arr, result
  end

  def test_parse_json_field_with_nil
    result = @processor.send(:parse_json_field, nil)
    assert_nil result
  end

  def test_parse_json_field_with_invalid_json
    result = @processor.send(:parse_json_field, "not json")
    assert_nil result
  end

  def test_select_repos_with_user_selected
    job = {
      "selected_repos" => '["owner/repo1", "owner/repo2"]',
      "pr_urls" => nil,
      "pr_url" => nil,
      "repo_url" => nil,
      "title" => "Bug",
      "summary" => "Desc"
    }

    result = @processor.send(:select_repos, job)
    assert_equal ["owner/repo1", "owner/repo2"], result
  end

  def test_select_repos_from_repo_url
    job = {
      "selected_repos" => nil,
      "pr_urls" => nil,
      "pr_url" => nil,
      "repo_url" => "https://github.com/owner/myrepo.git",
      "title" => "Bug",
      "summary" => "Desc"
    }

    result = @processor.send(:select_repos, job)
    assert_equal ["owner/myrepo"], result
  end

  def test_select_repos_from_owner_name_format
    job = {
      "selected_repos" => nil,
      "pr_urls" => nil,
      "pr_url" => nil,
      "repo_url" => "owner/myrepo",
      "title" => "Bug",
      "summary" => "Desc"
    }

    result = @processor.send(:select_repos, job)
    assert_equal ["owner/myrepo"], result
  end

  def test_select_repos_followup_from_pr_urls
    job = {
      "selected_repos" => nil,
      "pr_urls" => '[{"repo": "owner/repo1", "url": "https://github.com/owner/repo1/pull/1"}]',
      "pr_url" => nil,
      "repo_url" => nil,
      "title" => "Bug",
      "summary" => "Desc"
    }

    result = @processor.send(:select_repos, job, is_followup: true)
    assert_equal ["owner/repo1"], result
  end

  def test_select_repos_followup_from_single_pr_url
    job = {
      "selected_repos" => nil,
      "pr_urls" => nil,
      "pr_url" => "https://github.com/owner/myrepo/pull/5",
      "repo_url" => nil,
      "title" => "Bug",
      "summary" => "Desc"
    }

    result = @processor.send(:select_repos, job, is_followup: true)
    assert_equal ["owner/myrepo"], result
  end

  def test_select_repos_falls_back_to_llm_routing
    job = {
      "selected_repos" => nil,
      "pr_urls" => nil,
      "pr_url" => nil,
      "repo_url" => nil,
      "title" => "Bug title",
      "summary" => "Bug description"
    }

    DB.expects(:get_enabled_repos).returns(["owner/repo1", "owner/repo2"])
    RepoRouter.expects(:route).with("Bug title", "Bug description", ["owner/repo1", "owner/repo2"]).returns(["owner/repo1"])

    result = @processor.send(:select_repos, job)
    assert_equal ["owner/repo1"], result
  end

  def test_fail_job_updates_db
    DB.expects(:update_job).with(1, { "status" => "failed", "failure_reason" => "timeout" })
    DB.expects(:update_run).with(5, { "status" => "failed", "finished_at" => anything })
    RedisQueue.expects(:publish_status).with(1, anything)

    @processor.send(:fail_job, 1, 5, "timeout")
  end

  def test_fail_job_without_run_id
    DB.expects(:update_job).with(1, { "status" => "failed", "failure_reason" => "no repo" })
    DB.expects(:update_run).never
    RedisQueue.expects(:publish_status).with(1, anything)

    @processor.send(:fail_job, 1, nil, "no repo")
  end

  def test_generate_commit_message_uses_llm
    LLMClient.expects(:generate).returns("Fix misaligned header CSS")
    result = @processor.send(:generate_commit_message, "diff content", "Header is broken")
    assert_equal "Fix misaligned header CSS", result
  end

  def test_generate_commit_message_fallback_when_llm_nil
    LLMClient.expects(:generate).returns(nil)
    result = @processor.send(:generate_commit_message, "diff", "Button doesn't work")
    assert_includes result, "fix:"
    assert_includes result, "Button doesn't work"
  end

  def test_generate_commit_message_strips_quotes
    LLMClient.expects(:generate).returns('"Fix the alignment issue"')
    result = @processor.send(:generate_commit_message, "diff", "prompt")
    refute result.start_with?('"')
    refute result.end_with?('"')
  end

  def test_generate_commit_message_truncates_long_messages
    LLMClient.expects(:generate).returns("A" * 200)
    result = @processor.send(:generate_commit_message, "diff", "prompt")
    assert result.length <= 100
  end

  def test_generate_pr_body_uses_llm
    LLMClient.expects(:generate).returns("## Summary\nFixed the bug\n\n## Changes\n- Updated CSS")
    result = @processor.send(:generate_pr_body, "diff", "prompt", "passed", 1)
    assert_includes result, "Summary"
  end

  def test_generate_pr_body_fallback
    LLMClient.expects(:generate).returns(nil)
    result = @processor.send(:generate_pr_body, "diff", "prompt", "skipped", 42)
    assert_includes result, "job #42"
    assert_includes result, "skipped"
  end
end
