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
end
