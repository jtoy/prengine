require_relative "test_helper"
require_relative "../db"

class DBTest < Minitest::Test
  def setup
    @mock_conn = mock("pg_connection")
    # Set up a mock connection for the current thread
    DB.instance_variable_set(:@connections, { Thread.current.object_id => @mock_conn })
  end

  def teardown
    DB.instance_variable_set(:@connections, {})
  end

  def test_query_delegates_to_connection
    mock_result = mock("result")
    @mock_conn.expects(:exec_params).with("SELECT 1", []).returns(mock_result)
    result = DB.query("SELECT 1")
    assert_equal mock_result, result
  end

  def test_update_job_builds_correct_sql
    fields = { "status" => "failed", "failure_reason" => "timeout" }
    @mock_conn.expects(:exec_params).with(
      "UPDATE jobs SET status = $1, failure_reason = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
      ["failed", "timeout", 42]
    ).returns(mock("result"))

    DB.update_job(42, fields)
  end

  def test_update_job_with_single_field
    @mock_conn.expects(:exec_params).with(
      "UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      ["processing", 10]
    ).returns(mock("result"))

    DB.update_job(10, { "status" => "processing" })
  end

  def test_update_run_builds_correct_sql
    fields = { "status" => "completed", "finished_at" => "2024-01-01T00:00:00Z" }
    @mock_conn.expects(:exec_params).with(
      "UPDATE job_runs SET status = $1, finished_at = $2 WHERE id = $3 RETURNING *",
      ["completed", "2024-01-01T00:00:00Z", 5]
    ).returns(mock("result"))

    DB.update_run(5, fields)
  end

  def test_create_run
    mock_result = mock("result")
    @mock_conn.expects(:exec_params).with(
      "INSERT INTO job_runs (job_id, run_number, status, prompt) VALUES ($1, $2, 'pending', $3) RETURNING *",
      [1, 1, "Fix the bug"]
    ).returns(mock_result)

    DB.create_run(1, 1, "Fix the bug")
  end

  def test_create_run_without_prompt
    @mock_conn.expects(:exec_params).with(
      "INSERT INTO job_runs (job_id, run_number, status, prompt) VALUES ($1, $2, 'pending', $3) RETURNING *",
      [1, 2, nil]
    ).returns(mock("result"))

    DB.create_run(1, 2)
  end

  def test_get_job_returns_row_when_found
    mock_result = mock("result")
    mock_result.expects(:ntuples).returns(1)
    mock_result.expects(:[]).with(0).returns({ "id" => "1", "title" => "Bug" })
    @mock_conn.expects(:exec_params).returns(mock_result)

    job = DB.get_job(1)
    assert_equal "Bug", job["title"]
  end

  def test_get_job_returns_nil_when_not_found
    mock_result = mock("result")
    mock_result.expects(:ntuples).returns(0)
    @mock_conn.expects(:exec_params).returns(mock_result)

    assert_nil DB.get_job(999)
  end

  def test_get_latest_run_returns_row_when_found
    mock_result = mock("result")
    mock_result.expects(:ntuples).returns(1)
    mock_result.expects(:[]).with(0).returns({ "id" => "5", "run_number" => "2" })
    @mock_conn.expects(:exec_params).returns(mock_result)

    run = DB.get_latest_run(1)
    assert_equal "2", run["run_number"]
  end

  def test_get_latest_run_returns_nil_when_none
    mock_result = mock("result")
    mock_result.expects(:ntuples).returns(0)
    @mock_conn.expects(:exec_params).returns(mock_result)

    assert_nil DB.get_latest_run(999)
  end

  def test_next_run_number
    mock_result = mock("result")
    mock_result.expects(:[]).with(0).returns({ "next_run" => "3" })
    @mock_conn.expects(:exec_params).returns(mock_result)

    assert_equal 3, DB.next_run_number(1)
  end
end
