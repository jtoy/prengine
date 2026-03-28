require "open3"

class TestRunner
  def initialize(work_path)
    @work_path = work_path
  end

  # Detect and run tests.
  # Returns { success: bool, output: string, skipped: bool, command_not_found: bool }
  def run
    test_cmd, test_dir = detect_test_command
    unless test_cmd
      puts "[TestRunner] No test command detected, skipping."
      return { success: true, output: "No test command detected, skipping.", skipped: true, command_not_found: false }
    end

    puts "[TestRunner] Running: #{test_cmd} in #{test_dir}"
    stdout, stderr, status = Open3.capture3(
      test_cmd,
      chdir: test_dir
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

  # Returns [command, directory] or nil.
  # Prefers app subdirectories over root since repos like cartoon_maker
  # have the real app (with working tests) in a subdirectory.
  def detect_test_command
    # Check common app subdirectories first — these are more specific
    %w[frontend client app web src reactapp].each do |sub|
      sub_dir = File.join(@work_path, sub)
      next unless Dir.exist?(sub_dir)
      cmd = detect_test_in_dir(sub_dir)
      return [cmd, sub_dir] if cmd
    end

    # Fall back to repo root
    root_cmd = detect_test_in_dir(@work_path)
    return [root_cmd, @work_path] if root_cmd

    nil
  end

  def detect_test_in_dir(dir)
    pkg_path = File.join(dir, "package.json")
    if File.exist?(pkg_path)
      pkg = JSON.parse(File.read(pkg_path)) rescue {}
      return "npm test" if pkg.dig("scripts", "test")
    end

    if File.exist?(File.join(dir, "Gemfile"))
      return "bundle exec rspec" if Dir.exist?(File.join(dir, "spec"))
      return "bundle exec rake test" if File.exist?(File.join(dir, "Rakefile"))
    end

    if File.exist?(File.join(dir, "pytest.ini")) || File.exist?(File.join(dir, "setup.py"))
      return "pytest"
    end

    nil
  end
end
