require "open3"

class TestRunner
  def initialize(work_path)
    @work_path = work_path
  end

  # Detect and run tests. Returns { success: bool, output: string }
  def run
    test_cmd = detect_test_command
    return { success: true, output: "No test command detected, skipping." } unless test_cmd

    stdout, stderr, status = Open3.capture3(
      test_cmd,
      chdir: @work_path
    )

    {
      success: status.success?,
      output: (stdout + stderr).last(10_000), # Truncate to 10k chars
    }
  end

  private

  def detect_test_command
    if File.exist?(File.join(@work_path, "package.json"))
      pkg = JSON.parse(File.read(File.join(@work_path, "package.json")))
      if pkg.dig("scripts", "test")
        return "npm test"
      end
    end

    if File.exist?(File.join(@work_path, "Gemfile"))
      return "bundle exec rspec" if Dir.exist?(File.join(@work_path, "spec"))
      return "bundle exec rake test" if File.exist?(File.join(@work_path, "Rakefile"))
    end

    if File.exist?(File.join(@work_path, "pytest.ini")) || File.exist?(File.join(@work_path, "setup.py"))
      return "pytest"
    end

    nil
  end
end
