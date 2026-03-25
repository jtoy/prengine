require "net/http"
require "uri"
require "json"
require_relative "config"

module MediaUploader
  INGEST_PATH = "/api/v1/media/ingest"

  # Uploads a file to Distark and returns the hosted URL, or nil on failure.
  def self.upload(file_path, expires_in: "2.months")
    token = Config::DISTARK_TOKEN
    if token.nil? || token.empty?
      puts "[MediaUploader] No DISTARK_TOKEN configured, skipping upload"
      return nil
    end

    unless File.exist?(file_path)
      puts "[MediaUploader] File not found: #{file_path}"
      return nil
    end

    mime = detect_mime(file_path)
    kind = mime.start_with?("video/") ? "video" : "image"

    uri = URI.parse("#{Config::DISTARK_URL}#{INGEST_PATH}")
    boundary = "----RubyMultipart#{rand(1_000_000)}"

    body = build_multipart_body(file_path, mime, kind, expires_in, boundary)

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.read_timeout = 120

    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "multipart/form-data; boundary=#{boundary}"
    request["Authorization"] = "Bearer #{token}"
    request.body = body

    puts "[MediaUploader] Uploading #{File.basename(file_path)} (#{File.size(file_path)} bytes, #{mime})..."
    response = http.request(request)

    unless response.is_a?(Net::HTTPSuccess)
      puts "[MediaUploader] Upload failed: HTTP #{response.code} #{response.body}"
      return nil
    end

    result = JSON.parse(response.body)
    url = result["url"]
    puts "[MediaUploader] Upload successful: #{url}"
    url
  rescue => e
    puts "[MediaUploader] Error: #{e.message}"
    nil
  end

  def self.detect_mime(file_path)
    ext = File.extname(file_path).downcase
    case ext
    when ".mp4"  then "video/mp4"
    when ".webm" then "video/webm"
    when ".png"  then "image/png"
    when ".jpg", ".jpeg" then "image/jpeg"
    when ".gif"  then "image/gif"
    else "application/octet-stream"
    end
  end

  private

  def self.build_multipart_body(file_path, mime, kind, expires_in, boundary)
    parts = []

    # File part
    filename = File.basename(file_path)
    parts << "--#{boundary}\r\n"
    parts << "Content-Disposition: form-data; name=\"file\"; filename=\"#{filename}\"\r\n"
    parts << "Content-Type: #{mime}\r\n\r\n"
    parts << File.binread(file_path)
    parts << "\r\n"

    # Kind part
    parts << "--#{boundary}\r\n"
    parts << "Content-Disposition: form-data; name=\"kind\"\r\n\r\n"
    parts << kind
    parts << "\r\n"

    # Expires part
    parts << "--#{boundary}\r\n"
    parts << "Content-Disposition: form-data; name=\"expires_in\"\r\n\r\n"
    parts << expires_in
    parts << "\r\n"

    parts << "--#{boundary}--\r\n"
    parts.join
  end
end
