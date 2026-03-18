require_relative "test_helper"
require_relative "../db"

class DBLogTest < Minitest::Test
  def setup
    @mock_conn = mock("pg_connection")
    @mock_conn.stubs(:close)
    PG.stubs(:connect).returns(@mock_conn)
  end

  def test_insert_log_with_all_params
    @mock_conn.expects(:exec_params).with(
      "INSERT INTO job_logs (job_id, level, source, message) VALUES ($1, $2, $3, $4)",
      [42, "info", "JobProcessor", "Step 1: Cloning"]
    ).returns(mock("result"))

    DB.insert_log(42, "info", "JobProcessor", "Step 1: Cloning")
  end

  def test_insert_log_with_nil_job_id
    @mock_conn.expects(:exec_params).with(
      "INSERT INTO job_logs (job_id, level, source, message) VALUES ($1, $2, $3, $4)",
      [nil, "warn", "System", "Worker started"]
    ).returns(mock("result"))

    DB.insert_log(nil, "warn", "System", "Worker started")
  end

  def test_insert_log_rescues_errors
    @mock_conn.expects(:exec_params).raises(PG::Error.new("connection refused"))

    # Should not raise — the rescue block catches it
    assert_nil DB.insert_log(1, "info", "JobProcessor", "test")
  end
end
