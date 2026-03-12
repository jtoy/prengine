require "json"
require "net/http"

class NgrokManager
  def initialize
    @pid = nil
  end

  # Start an ngrok tunnel for a local port.
  # Returns the public URL or nil.
  def start(port)
    stop # kill any existing tunnel first

    @pid = spawn("ngrok", "http", port.to_s, [:out, :err] => "/dev/null")
    Process.detach(@pid)

    # Poll the local API until the tunnel is up (max 10s)
    url = nil
    20.times do
      sleep 0.5
      url = fetch_tunnel_url
      break if url
    end

    if url
      puts "[Ngrok] Tunnel open: #{url}"
    else
      puts "[Ngrok] Warning: tunnel started but could not retrieve URL"
    end

    url
  end

  def stop
    return unless @pid
    Process.kill("TERM", @pid) rescue nil
    @pid = nil
    sleep 0.5 # let it shut down
    puts "[Ngrok] Tunnel stopped"
  end

  def running?
    !!fetch_tunnel_url
  end

  private

  def fetch_tunnel_url
    uri = URI("http://localhost:4040/api/tunnels")
    response = Net::HTTP.get(uri)
    data = JSON.parse(response)
    tunnel = data["tunnels"]&.find { |t| t["proto"] == "https" } || data["tunnels"]&.first
    tunnel&.dig("public_url")
  rescue
    nil
  end
end
