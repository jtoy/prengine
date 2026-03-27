require "open3"

class TestRunner
  # Common Playwright artifact directories
  PLAYWRIGHT_RESULTS_DIR = "test-results"

  # Media file extensions to collect as artifacts
  ARTIFACT_EXTENSIONS = %w[.png .jpg .jpeg .webp .gif .mp4 .webm .zip].freeze

  # Max total artifact size to collect (50 MB)
  MAX_ARTIFACTS_SIZE = 50 * 1024 * 1024

  def initialize(work_path)
    @work_path = work_path
  end

  # Detect and run tests.
  # Returns { success: bool, output: string, skipped: bool, command_not_found: bool, artifacts: array }
  def run
    test_cmd = detect_test_command
    unless test_cmd
      puts "[TestRunner] No test command detected, skipping."
      return { success: true, output: "No test command detected, skipping.", skipped: true, command_not_found: false, artifacts: [] }
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

    # Collect test artifacts (screenshots, videos) on failure
    artifacts = []
    unless status.success?
      artifacts = collect_test_artifacts
      puts "[TestRunner] Collected #{artifacts.length} test artifact(s)"
    end

    {
      success: status.success?,
      output: output,
      skipped: false,
      command_not_found: cmd_not_found,
      artifacts: artifacts,
    }
  end

  # Collect screenshots and videos from Playwright test-results directory.
  # Returns array of { path: string, filename: string, mime_type: string }
  def collect_test_artifacts
    results_dir = File.join(@work_path, PLAYWRIGHT_RESULTS_DIR)
    return [] unless Dir.exist?(results_dir)

    artifacts = []
    total_size = 0

    Dir.glob(File.join(results_dir, "**", "*")).sort.each do |file_path|
      next unless File.file?(file_path)

      ext = File.extname(file_path).downcase
      next unless ARTIFACT_EXTENSIONS.include?(ext)

      file_size = File.size(file_path)
      break if total_size + file_size > MAX_ARTIFACTS_SIZE

      mime_type = mime_for_extension(ext)
      filename = File.basename(file_path)

      artifacts << {
        path: file_path,
        filename: filename,
        mime_type: mime_type,
      }
      total_size += file_size

      puts "[TestRunner] Found artifact: #{filename} (#{mime_type}, #{file_size} bytes)"
    end

    artifacts
  end

  private

  def mime_for_extension(ext)
    case ext
    when ".png" then "image/png"
    when ".jpg", ".jpeg" then "image/jpeg"
    when ".webp" then "image/webp"
    when ".gif" then "image/gif"
    when ".mp4" then "video/mp4"
    when ".webm" then "video/webm"
    else "application/octet-stream"
    end
  end

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
