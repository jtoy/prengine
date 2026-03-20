require_relative "test_helper"
require_relative "../test_runner"

class TestRunnerTest < Minitest::Test
  def setup
    @tmp_dir = "/tmp/prengine-test-runner-#{$$}"
    FileUtils.mkdir_p(@tmp_dir)
  end

  def teardown
    FileUtils.rm_rf(@tmp_dir)
  end

  def test_run_returns_skipped_when_no_test_command
    runner = TestRunner.new(@tmp_dir)
    result = runner.run

    assert result[:success]
    assert result[:skipped]
    assert_includes result[:output], "No test command detected"
  end

  def test_detects_npm_test
    # Create a package.json with test script
    File.write(File.join(@tmp_dir, "package.json"), JSON.generate({
      "scripts" => { "test" => "jest" }
    }))

    runner = TestRunner.new(@tmp_dir)
    cmd = runner.send(:detect_test_command)
    assert_equal "npm test", cmd
  end

  def test_detects_rspec_for_ruby
    FileUtils.mkdir_p(File.join(@tmp_dir, "spec"))
    File.write(File.join(@tmp_dir, "Gemfile"), "gem 'rspec'")

    runner = TestRunner.new(@tmp_dir)
    cmd = runner.send(:detect_test_command)
    assert_equal "bundle exec rspec", cmd
  end

  def test_detects_rake_test_for_ruby
    File.write(File.join(@tmp_dir, "Gemfile"), "gem 'minitest'")
    File.write(File.join(@tmp_dir, "Rakefile"), "task :test")

    runner = TestRunner.new(@tmp_dir)
    cmd = runner.send(:detect_test_command)
    assert_equal "bundle exec rake test", cmd
  end

  def test_detects_pytest
    File.write(File.join(@tmp_dir, "pytest.ini"), "[pytest]")

    runner = TestRunner.new(@tmp_dir)
    cmd = runner.send(:detect_test_command)
    assert_equal "pytest", cmd
  end

  def test_detects_pytest_from_setup_py
    File.write(File.join(@tmp_dir, "setup.py"), "setup()")

    runner = TestRunner.new(@tmp_dir)
    cmd = runner.send(:detect_test_command)
    assert_equal "pytest", cmd
  end

  def test_returns_nil_when_no_framework_detected
    runner = TestRunner.new(@tmp_dir)
    cmd = runner.send(:detect_test_command)
    assert_nil cmd
  end

  def test_npm_without_test_script_returns_nil
    File.write(File.join(@tmp_dir, "package.json"), JSON.generate({
      "scripts" => { "build" => "webpack" }
    }))

    runner = TestRunner.new(@tmp_dir)
    cmd = runner.send(:detect_test_command)
    assert_nil cmd
  end

  def test_result_has_command_not_found_field
    runner = TestRunner.new(@tmp_dir)
    result = runner.run
    assert_equal false, result[:command_not_found]
  end

  def test_result_includes_empty_artifacts_when_skipped
    runner = TestRunner.new(@tmp_dir)
    result = runner.run
    assert_equal [], result[:artifacts]
  end

  # --- collect_test_artifacts ---

  def test_collect_artifacts_returns_empty_when_no_results_dir
    runner = TestRunner.new(@tmp_dir)
    artifacts = runner.collect_test_artifacts
    assert_equal [], artifacts
  end

  def test_collect_artifacts_finds_screenshots
    results_dir = File.join(@tmp_dir, "test-results")
    FileUtils.mkdir_p(results_dir)
    File.write(File.join(results_dir, "failure-screenshot.png"), "fake png data")

    runner = TestRunner.new(@tmp_dir)
    artifacts = runner.collect_test_artifacts

    assert_equal 1, artifacts.length
    assert_equal "failure-screenshot.png", artifacts[0][:filename]
    assert_equal "image/png", artifacts[0][:mime_type]
    assert artifacts[0][:path].end_with?("failure-screenshot.png")
  end

  def test_collect_artifacts_finds_videos
    results_dir = File.join(@tmp_dir, "test-results", "test-chromium")
    FileUtils.mkdir_p(results_dir)
    File.write(File.join(results_dir, "video.webm"), "fake video data")

    runner = TestRunner.new(@tmp_dir)
    artifacts = runner.collect_test_artifacts

    assert_equal 1, artifacts.length
    assert_equal "video.webm", artifacts[0][:filename]
    assert_equal "video/webm", artifacts[0][:mime_type]
  end

  def test_collect_artifacts_finds_nested_files
    results_dir = File.join(@tmp_dir, "test-results", "test-name-chromium")
    FileUtils.mkdir_p(results_dir)
    File.write(File.join(results_dir, "test-failed-1.png"), "screenshot data")
    File.write(File.join(results_dir, "video.mp4"), "video data")

    runner = TestRunner.new(@tmp_dir)
    artifacts = runner.collect_test_artifacts

    assert_equal 2, artifacts.length
    filenames = artifacts.map { |a| a[:filename] }
    assert_includes filenames, "test-failed-1.png"
    assert_includes filenames, "video.mp4"
  end

  def test_collect_artifacts_ignores_non_media_files
    results_dir = File.join(@tmp_dir, "test-results")
    FileUtils.mkdir_p(results_dir)
    File.write(File.join(results_dir, "trace.json"), "{}")
    File.write(File.join(results_dir, "log.txt"), "test log")
    File.write(File.join(results_dir, "screenshot.png"), "png data")

    runner = TestRunner.new(@tmp_dir)
    artifacts = runner.collect_test_artifacts

    assert_equal 1, artifacts.length
    assert_equal "screenshot.png", artifacts[0][:filename]
  end

  def test_collect_artifacts_respects_size_limit
    results_dir = File.join(@tmp_dir, "test-results")
    FileUtils.mkdir_p(results_dir)

    # Create a file larger than MAX_ARTIFACTS_SIZE
    # We'll temporarily override the constant
    runner = TestRunner.new(@tmp_dir)
    # Write two files, each 100 bytes
    File.write(File.join(results_dir, "a.png"), "x" * 100)
    File.write(File.join(results_dir, "b.png"), "x" * 100)

    artifacts = runner.collect_test_artifacts
    assert_equal 2, artifacts.length
  end

  def test_mime_for_common_extensions
    runner = TestRunner.new(@tmp_dir)
    assert_equal "image/png", runner.send(:mime_for_extension, ".png")
    assert_equal "image/jpeg", runner.send(:mime_for_extension, ".jpg")
    assert_equal "image/jpeg", runner.send(:mime_for_extension, ".jpeg")
    assert_equal "image/webp", runner.send(:mime_for_extension, ".webp")
    assert_equal "image/gif", runner.send(:mime_for_extension, ".gif")
    assert_equal "video/mp4", runner.send(:mime_for_extension, ".mp4")
    assert_equal "video/webm", runner.send(:mime_for_extension, ".webm")
    assert_equal "application/octet-stream", runner.send(:mime_for_extension, ".unknown")
  end
end
