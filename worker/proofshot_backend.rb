require "open3"
require "fileutils"
require "timeout"
require "shellwords"

class ProofshotBackend
  # Returns { video_path: String|nil, screenshot_paths: [String], success: bool }
  def record(repo_dir:, dev_cmd:, port:, timeout: 600)
    artifact_dir = File.join(repo_dir, ".bugfix", "proofshot-artifacts")
    FileUtils.mkdir_p(File.join(repo_dir, ".bugfix"))

    Timeout.timeout(timeout) do
      # 0. Install deps if needed
      if File.exist?(File.join(repo_dir, "package.json")) && !Dir.exist?(File.join(repo_dir, "node_modules"))
        puts "[ProofshotBackend] Installing npm dependencies..."
        run_cmd("npm install", chdir: repo_dir)
      end

      # 1. Start proofshot (launches dev server + browser + recording)
      env = { "PORT" => port.to_s }
      start_result = run_cmd("proofshot start --run '#{dev_cmd}' --port #{port}", chdir: repo_dir, env: env)
      unless start_result[:status].success?
        puts "[ProofshotBackend] proofshot start failed, aborting proof recording"
        return { video_path: nil, screenshot_paths: [], success: false }
      end
      sleep 3 # let page render for video content

      # 2. Take screenshot
      run_cmd("proofshot exec screenshot", chdir: repo_dir)
      sleep 2

      # 3. Stop (generates artifacts)
      run_cmd("proofshot stop", chdir: repo_dir)
    end

    # 4. Convert session.webm -> session.mp4 via ffmpeg
    webm_path = File.join(artifact_dir, "session.webm")
    mp4_path = File.exist?(webm_path) ? convert_to_mp4(webm_path) : nil

    # 5. Collect screenshot paths
    screenshots = Dir.glob(File.join(artifact_dir, "step-*.png"))

    has_artifacts = mp4_path || screenshots.any?
    { video_path: mp4_path, screenshot_paths: screenshots, success: has_artifacts }
  rescue Timeout::Error
    puts "[ProofshotBackend] Timeout after #{timeout}s"
    cleanup_proofshot(repo_dir)
    { video_path: nil, screenshot_paths: [], success: false }
  rescue => e
    puts "[ProofshotBackend] Error: #{e.message}"
    cleanup_proofshot(repo_dir)
    { video_path: nil, screenshot_paths: [], success: false }
  end

  private

  def run_cmd(cmd, chdir:, env: {})
    puts "[ProofshotBackend] Running: #{cmd} (in #{chdir})"
    path = "#{ENV['HOME']}/bin:#{ENV['HOME']}/.asdf/shims:/opt/homebrew/bin:#{ENV['PATH']}"
    full_env = env.merge("PATH" => path)
    puts "[ProofshotBackend] PATH prefix: #{path.split(':').first(3).join(':')}"
    stdout, stderr, status = Open3.capture3(full_env, cmd, chdir: chdir)
    unless status.success?
      puts "[ProofshotBackend] Command failed (exit #{status.exitstatus}): #{stderr.to_s.lines.last&.strip}"
    end
    { stdout: stdout, stderr: stderr, status: status }
  end

  def convert_to_mp4(webm_path)
    mp4_path = webm_path.sub(/\.webm\z/, ".mp4")
    cmd = "ffmpeg -y -i #{webm_path.shellescape} -c:v libx264 -preset fast -crf 23 -c:a aac #{mp4_path.shellescape} 2>&1"
    puts "[ProofshotBackend] Converting webm -> mp4..."
    result = `#{cmd}`
    status = $?

    if status.success? && File.exist?(mp4_path) && File.size(mp4_path) > 0
      puts "[ProofshotBackend] Conversion successful: #{File.size(mp4_path)} bytes"
      mp4_path
    else
      puts "[ProofshotBackend] Conversion failed (exit #{status.exitstatus}): #{result.to_s.lines.last&.strip}"
      nil
    end
  end

  def cleanup_proofshot(repo_dir)
    puts "[ProofshotBackend] Cleaning up..."
    Open3.capture3("proofshot stop", chdir: repo_dir) rescue nil
    Open3.capture3("proofshot kill-all", chdir: repo_dir) rescue nil
  end
end
