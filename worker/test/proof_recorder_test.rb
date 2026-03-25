require_relative "test_helper"
require_relative "../proof_recorder"

class ProofRecorderTest < Minitest::Test
  def test_delegates_to_backend_and_returns_result
    mock_backend = mock("backend")
    expected = { video_path: "/tmp/vid.mp4", screenshot_paths: ["/tmp/s1.png"], success: true }
    mock_backend.expects(:record).with(
      repo_dir: "/tmp/repo", dev_cmd: "npm run dev", port: 3000, timeout: 600
    ).returns(expected)

    ProofRecorder.expects(:create_backend).returns(mock_backend)

    result = ProofRecorder.record(repo_dir: "/tmp/repo", dev_cmd: "npm run dev", port: 3000, timeout: 600)
    assert_equal expected, result
  end

  def test_returns_failure_hash_on_error
    ProofRecorder.expects(:create_backend).raises(RuntimeError.new("boom"))

    result = ProofRecorder.record(repo_dir: "/tmp/repo", dev_cmd: "npm run dev", port: 3000)
    assert_nil result[:video_path]
    assert_equal [], result[:screenshot_paths]
    assert_equal false, result[:success]
  end

  def test_create_backend_returns_proofshot_by_default
    backend = ProofRecorder.create_backend
    assert_instance_of ProofshotBackend, backend
  end

  def test_create_backend_returns_proofshot_for_unknown
    original = Config::PROOF_BACKEND
    Config.send(:remove_const, :PROOF_BACKEND)
    Config.const_set(:PROOF_BACKEND, "unknown")

    backend = ProofRecorder.create_backend
    assert_instance_of ProofshotBackend, backend
  ensure
    Config.send(:remove_const, :PROOF_BACKEND)
    Config.const_set(:PROOF_BACKEND, original)
  end
end
