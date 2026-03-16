require_relative "test_helper"
require_relative "../redis_client"

class RedisClientTest < Minitest::Test
  def setup
    @mock_redis = mock("redis")
  end

  def test_pop_job_returns_parsed_json
    message = { job_id: 1, type: "new_job" }
    mock_queue_redis = mock("queue_redis")
    mock_queue_redis.expects(:brpop).with(Config::QUEUE_KEY, timeout: 5).returns(["bugfixvibe:jobs", message.to_json])
    RedisQueue.instance_variable_set(:@queue_connection, mock_queue_redis)

    result = RedisQueue.pop_job(timeout: 5)
    assert_equal 1, result[:job_id]
    assert_equal "new_job", result[:type]
  ensure
    RedisQueue.instance_variable_set(:@queue_connection, nil)
  end

  def test_pop_job_returns_nil_on_timeout
    mock_queue_redis = mock("queue_redis")
    mock_queue_redis.expects(:brpop).returns(nil)
    RedisQueue.instance_variable_set(:@queue_connection, mock_queue_redis)

    result = RedisQueue.pop_job(timeout: 1)
    assert_nil result
  ensure
    RedisQueue.instance_variable_set(:@queue_connection, nil)
  end

  def test_requeue_pushes_json_to_queue
    message = { job_id: 5, type: "followup" }
    mock_conn = mock("redis_conn")
    mock_conn.expects(:lpush).with(Config::QUEUE_KEY, message.to_json)

    # Store and set thread connection
    RedisQueue.instance_variable_set(:@connections, { Thread.current.object_id => mock_conn })
    RedisQueue.requeue(message)
  ensure
    RedisQueue.instance_variable_set(:@connections, {})
  end

  def test_publish_status_uses_correct_channel
    mock_conn = mock("redis_conn")
    payload = { status: "processing" }
    mock_conn.expects(:publish).with("bugfixvibe:status:42", payload.to_json)

    RedisQueue.instance_variable_set(:@connections, { Thread.current.object_id => mock_conn })
    RedisQueue.publish_status(42, payload)
  ensure
    RedisQueue.instance_variable_set(:@connections, {})
  end
end
