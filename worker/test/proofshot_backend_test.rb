require_relative "test_helper"
require_relative "../proofshot_backend"

class ProofshotBackendTest < Minitest::Test
  def setup
    @backend = ProofshotBackend.new
    @repo_dir = Dir.mktmpdir("proofshot-test")
    FileUtils.mkdir_p(File.join(@repo_dir, ".bugfix", "proofshot-artifacts"))
  end

  def teardown
    FileUtils.rm_rf(@repo_dir)
  end

  def test_record_calls_proofshot_commands_and_returns_success
    success_status = stub(success?: true, exitstatus: 0)

    # Mock the three proofshot commands
    Open3.expects(:capture3).with(
      { "PORT" => "3000" },
      "proofshot start --run npm\\ run\\ dev --port 3000",
      chdir: @repo_dir
    ).returns(["", "", success_status])

    Open3.expects(:capture3).with(
      {},
      "proofshot exec screenshot",
      chdir: @repo_dir
    ).returns(["", "", success_status])

    Open3.expects(:capture3).with(
      {},
      "proofshot stop",
      chdir: @repo_dir
    ).returns(["", "", success_status])

    # Stub sleep to speed up tests
    @backend.stubs(:sleep)

    result = @backend.record(repo_dir: @repo_dir, dev_cmd: "npm run dev", port: 3000, timeout: 10)
    assert result[:success]
    assert_nil result[:video_path] # no webm file created in test
    assert_equal [], result[:screenshot_paths]
  end

  def test_record_converts_webm_to_mp4
    success_status = stub(success?: true, exitstatus: 0)
    Open3.stubs(:capture3).returns(["", "", success_status])
    @backend.stubs(:sleep)

    # Create a fake webm file
    artifact_dir = File.join(@repo_dir, ".bugfix", "proofshot-artifacts")
    webm_path = File.join(artifact_dir, "session.webm")
    File.write(webm_path, "fake webm data")

    # Stub the ffmpeg conversion
    mp4_path = File.join(artifact_dir, "session.mp4")
    @backend.expects(:convert_to_mp4).with(webm_path).returns(mp4_path)

    result = @backend.record(repo_dir: @repo_dir, dev_cmd: "npm run dev", port: 3000, timeout: 10)
    assert result[:success]
    assert_equal mp4_path, result[:video_path]
  end

  def test_record_collects_screenshot_paths
    success_status = stub(success?: true, exitstatus: 0)
    Open3.stubs(:capture3).returns(["", "", success_status])
    @backend.stubs(:sleep)

    # Create fake screenshot files
    artifact_dir = File.join(@repo_dir, ".bugfix", "proofshot-artifacts")
    File.write(File.join(artifact_dir, "step-1.png"), "fake png")
    File.write(File.join(artifact_dir, "step-2.png"), "fake png")

    result = @backend.record(repo_dir: @repo_dir, dev_cmd: "npm start", port: 8080, timeout: 10)
    assert result[:success]
    assert_equal 2, result[:screenshot_paths].size
  end

  def test_record_returns_failure_on_timeout
    # Simulate Timeout::Error by having run_cmd raise it
    @backend.stubs(:sleep)
    @backend.stubs(:run_cmd).raises(Timeout::Error.new("execution expired"))

    # Stub cleanup calls
    Open3.stubs(:capture3).returns(["", "", stub(success?: true)])

    result = @backend.record(repo_dir: @repo_dir, dev_cmd: "npm start", port: 3000, timeout: 1)
    assert_equal false, result[:success]
    assert_nil result[:video_path]
    assert_equal [], result[:screenshot_paths]
  end

  def test_record_returns_failure_on_error
    Open3.stubs(:capture3).raises(RuntimeError.new("command not found"))
    @backend.stubs(:sleep)

    result = @backend.record(repo_dir: @repo_dir, dev_cmd: "npm start", port: 3000, timeout: 10)
    assert_equal false, result[:success]
    assert_nil result[:video_path]
  end

  def test_cleanup_proofshot_calls_stop_and_kill_all
    Open3.expects(:capture3).with("proofshot stop", chdir: @repo_dir).returns(["", "", stub(success?: true)])
    Open3.expects(:capture3).with("proofshot kill-all", chdir: @repo_dir).returns(["", "", stub(success?: true)])

    @backend.send(:cleanup_proofshot, @repo_dir)
  end

  def test_port_is_passed_as_env_var
    success_status = stub(success?: true, exitstatus: 0)
    @backend.stubs(:sleep)

    Open3.expects(:capture3).with(
      { "PORT" => "5142" },
      "proofshot start --run npm\\ start --port 5142",
      chdir: @repo_dir
    ).returns(["", "", success_status])

    Open3.stubs(:capture3).with({}, anything, chdir: @repo_dir).returns(["", "", success_status])

    @backend.record(repo_dir: @repo_dir, dev_cmd: "npm start", port: 5142, timeout: 10)
  end
end
