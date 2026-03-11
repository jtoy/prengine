require "open3"
require "json"

class NgrokManager
  def initialize
    @processes = {}
  end

  # Start an ngrok tunnel for a local port
  # Returns the public URL or nil
  def start(port, label: nil)
    key = label || port.to_s

    stdout, stderr, status = Open3.capture3(
      "ngrok", "http", port.to_s,
      "--log", "stdout",
      "--log-format", "json"
    )

    # For background process, use spawn instead
    pid = spawn(
      "ngrok", "http", port.to_s,
      [:out, :err] => "/dev/null"
    )
    Process.detach(pid)
    @processes[key] = pid

    # Wait for tunnel to be ready and get URL
    sleep 2
    url = get_tunnel_url
    url
  rescue => e
    puts "Failed to start ngrok: #{e.message}"
    nil
  end

  def stop(label: nil, port: nil)
    key = label || port&.to_s
    pid = @processes.delete(key)
    if pid
      Process.kill("TERM", pid) rescue nil
    end
  end

  def stop_all
    @processes.each do |_key, pid|
      Process.kill("TERM", pid) rescue nil
    end
    @processes.clear
  end

  private

  def get_tunnel_url
    # Query ngrok API for tunnel info
    response = `curl -s http://localhost:4040/api/tunnels 2>/dev/null`
    data = JSON.parse(response)
    tunnel = data["tunnels"]&.first
    tunnel&.dig("public_url")
  rescue
    nil
  end
end
