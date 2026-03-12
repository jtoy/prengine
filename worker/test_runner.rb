require "open3"

class TestRunner
  def initialize(work_path)
    @work_path = work_path
  end

  # Detect and run tests.
  # Returns { success: bool, output: string, skipped: bool, command_not_found: bool }
  def run
    test_cmd = detect_test_command
    unless test_cmd
      puts "[TestRunner] No test command detected, skipping."
      return { success: true, output: "No test command detected, skipping.", skipped: true, command_not_found: false }
    end

    puts "[TestRunner] Running: #{test_cmd}"
    stdout, stderr, status = Open3.capture3(
      test_cmd,
      chdir: @work_path
    )

    combined = (stdout + stderr)
    output = combined.length > 10_000 ? combined[-10_000..] : combined
    cmd_not_found = status.exitstatus == 127 || combined.match?(/command not found|not found|No such file/i)

    puts "[TestRunner] Exit code: #{status.exitstatus}, output: #{combined.length} chars, command_not_found: #{cmd_not_found}"

    {
      success: status.success?,
      output: output,
      skipped: false,
      command_not_found: cmd_not_found,
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
