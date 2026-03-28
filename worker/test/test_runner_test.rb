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
    File.write(File.join(@tmp_dir, "package.json"), JSON.generate({
      "scripts" => { "test" => "jest" }
    }))

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "npm test", cmd
    assert_equal @tmp_dir, dir
  end

  def test_detects_rspec_for_ruby
    FileUtils.mkdir_p(File.join(@tmp_dir, "spec"))
    File.write(File.join(@tmp_dir, "Gemfile"), "gem 'rspec'")

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "bundle exec rspec", cmd
    assert_equal @tmp_dir, dir
  end

  def test_detects_rake_test_for_ruby
    File.write(File.join(@tmp_dir, "Gemfile"), "gem 'minitest'")
    File.write(File.join(@tmp_dir, "Rakefile"), "task :test")

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "bundle exec rake test", cmd
    assert_equal @tmp_dir, dir
  end

  def test_detects_pytest
    File.write(File.join(@tmp_dir, "pytest.ini"), "[pytest]")

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "pytest", cmd
    assert_equal @tmp_dir, dir
  end

  def test_detects_pytest_from_setup_py
    File.write(File.join(@tmp_dir, "setup.py"), "setup()")

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "pytest", cmd
    assert_equal @tmp_dir, dir
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

  # Subdirectory detection: prefers reactapp/frontend/etc over root
  def test_prefers_subdirectory_over_root
    # Root has a package.json with test (like cartoon_maker's broken playwright-test)
    File.write(File.join(@tmp_dir, "package.json"), JSON.generate({
      "scripts" => { "test" => "playwright-test" }
    }))

    # reactapp/ subdirectory has the real test setup
    reactapp_dir = File.join(@tmp_dir, "reactapp")
    FileUtils.mkdir_p(reactapp_dir)
    File.write(File.join(reactapp_dir, "package.json"), JSON.generate({
      "scripts" => { "test" => "react-scripts test" }
    }))

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "npm test", cmd
    assert_equal reactapp_dir, dir
  end

  def test_falls_back_to_root_when_no_subdirectory_match
    File.write(File.join(@tmp_dir, "package.json"), JSON.generate({
      "scripts" => { "test" => "jest" }
    }))

    # Create a subdirectory without tests
    FileUtils.mkdir_p(File.join(@tmp_dir, "frontend"))

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "npm test", cmd
    assert_equal @tmp_dir, dir
  end

  def test_detects_tests_in_frontend_subdirectory
    frontend_dir = File.join(@tmp_dir, "frontend")
    FileUtils.mkdir_p(frontend_dir)
    File.write(File.join(frontend_dir, "package.json"), JSON.generate({
      "scripts" => { "test" => "vitest" }
    }))

    runner = TestRunner.new(@tmp_dir)
    cmd, dir = runner.send(:detect_test_command)
    assert_equal "npm test", cmd
    assert_equal frontend_dir, dir
  end
end
