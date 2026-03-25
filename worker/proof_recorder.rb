require_relative "config"
require_relative "proofshot_backend"

module ProofRecorder
  # Returns { video_path: String|nil, screenshot_paths: [String], success: bool }
  def self.record(repo_dir:, dev_cmd:, port:, timeout: Config::PROOF_TIMEOUT)
    backend = create_backend
    backend.record(repo_dir: repo_dir, dev_cmd: dev_cmd, port: port, timeout: timeout)
  rescue => e
    puts "[ProofRecorder] Error: #{e.message}"
    { video_path: nil, screenshot_paths: [], success: false }
  end

  def self.create_backend
    case Config::PROOF_BACKEND
    when "proofshot" then ProofshotBackend.new
    # when "playwright" then PlaywrightBackend.new  # future
    else ProofshotBackend.new
    end
  end
end
