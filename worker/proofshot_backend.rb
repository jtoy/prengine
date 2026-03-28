require "open3"
require "fileutils"
require "timeout"
require "shellwords"
require "socket"

class ProofshotBackend
  # Returns { video_path: String|nil, screenshot_paths: [String], success: bool }
  def record(repo_dir:, dev_cmd:, port:, timeout: 600)
    artifact_dir = File.join(repo_dir, "proofshot-artifacts")
    FileUtils.mkdir_p(File.join(repo_dir, ".bugfix"))

    Timeout.timeout(timeout) do
      # 0. Install deps if needed
      if File.exist?(File.join(repo_dir, "package.json")) && !Dir.exist?(File.join(repo_dir, "node_modules"))
        puts "[ProofshotBackend] Installing npm dependencies..."
        run_cmd("npm install", chdir: repo_dir)
      end

      # 0b. Clean stale proofshot state
      run_cmd("proofshot clean", chdir: repo_dir)
      run_cmd("agent-browser close --all", chdir: repo_dir)

      # 1. Start proofshot in background (it's a long-running foreground process)
      env = proof_env("PORT" => port.to_s)
      start_cmd = "proofshot start --run '#{dev_cmd}' --port #{port}"
      proofshot_log = File.join(repo_dir, ".bugfix", "proofshot.log")
      puts "[ProofshotBackend] Starting: #{start_cmd} (in #{repo_dir})"
      log_fd = File.open(proofshot_log, "w")
      start_pid = spawn(env, start_cmd, chdir: repo_dir, out: log_fd, err: log_fd)
      Process.detach(start_pid)
      log_fd.close
      puts "[ProofshotBackend] proofshot start spawned (pid: #{start_pid}, log: #{proofshot_log})"

      # 2. Wait for dev server + browser to be ready
      puts "[ProofshotBackend] Waiting for port #{port}..."
      unless wait_for_port(port, timeout: 90)
        puts "[ProofshotBackend] Port #{port} never opened, aborting"
        cleanup_proofshot(repo_dir)
        return { video_path: nil, screenshot_paths: [], success: false }
      end
      puts "[ProofshotBackend] Port #{port} is up"
      sleep 15 # let proofshot finish browser setup + recording retries

      # 3. Take screenshot
      run_cmd("proofshot exec screenshot", chdir: repo_dir)
      sleep 3

      # 4. Stop (generates artifacts)
      stop_result = run_cmd("proofshot stop", chdir: repo_dir)
      unless stop_result[:status].success?
        log_content = File.read(proofshot_log) rescue "could not read"
        puts "[ProofshotBackend] proofshot.log:\n#{log_content[0..2000]}"
      end
    end

    # 5. Find the session dir (proofshot creates timestamped subdirs)
    session_dirs = Dir.glob(File.join(artifact_dir, "*")).select { |f| File.directory?(f) }.sort
    session_dir = session_dirs.last || artifact_dir
    puts "[ProofshotBackend] Session dir: #{session_dir}"
    puts "[ProofshotBackend] Files: #{Dir.glob(File.join(session_dir, '*')).map { |f| File.basename(f) }.join(', ')}"

    # 6. Convert session.webm -> session.mp4 via ffmpeg
    webm_path = Dir.glob(File.join(session_dir, "*.webm")).first
    mp4_path = webm_path && File.exist?(webm_path) ? convert_to_mp4(webm_path) : nil

    # 7. Collect screenshot paths
    screenshots = Dir.glob(File.join(session_dir, "*.png")) + Dir.glob(File.join(session_dir, "screenshots", "*.png"))

    has_artifacts = mp4_path || screenshots.any?
    puts "[ProofshotBackend] Artifacts: video=#{!mp4_path.nil?}, screenshots=#{screenshots.size}"
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

  def proof_env(extra = {})
    home = ENV['HOME'] || "/Users/jtoy"
    path = "#{home}/bin:#{home}/.asdf/shims:#{home}/.asdf/installs/nodejs/22.22.0/bin:/opt/homebrew/bin:#{ENV['PATH']}"
    { "PATH" => path, "HOME" => home }.merge(extra)
  end

  def run_cmd(cmd, chdir:, env: {})
    puts "[ProofshotBackend] Running: #{cmd} (in #{chdir})"
    full_env = proof_env(env)
    stdout, stderr, status = Open3.capture3(full_env, cmd, chdir: chdir)
    unless status.success?
      puts "[ProofshotBackend] Command failed (exit #{status.exitstatus}): #{stderr.to_s.lines.last&.strip}"
    end
    { stdout: stdout, stderr: stderr, status: status }
  end

  def wait_for_port(port, timeout: 60)
    deadline = Time.now + timeout
    while Time.now < deadline
      begin
        TCPSocket.new("127.0.0.1", port).close
        return true
      rescue Errno::ECONNREFUSED, Errno::ECONNRESET
        sleep 2
      end
    end
    false
  end

  def convert_to_mp4(webm_path)
    mp4_path = webm_path.sub(/\.webm\z/, ".mp4")
    full_env = proof_env
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
    env = proof_env
    Open3.capture3(env, "proofshot stop", chdir: repo_dir) rescue nil
    Open3.capture3(env, "proofshot clean", chdir: repo_dir) rescue nil
  end
end
