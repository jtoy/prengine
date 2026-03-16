require_relative "test_helper"
require_relative "../ngrok_manager"

class NgrokManagerTest < Minitest::Test
  def test_initialize
    mgr = NgrokManager.new
    refute mgr.instance_variable_get(:@pid)
  end

  def test_stop_does_nothing_when_not_running
    mgr = NgrokManager.new
    # Should not raise
    mgr.stop
  end

  def test_running_returns_false_when_ngrok_not_available
    mgr = NgrokManager.new
    # The fetch_tunnel_url will fail since ngrok isn't running
    refute mgr.running?
  end
end
