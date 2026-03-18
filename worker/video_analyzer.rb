require "net/http"
require "uri"
require "json"
require "tempfile"
require "fileutils"
require "shellwords"
require_relative "config"

module VideoAnalyzer
  GEMINI_BASE = "https://generativelanguage.googleapis.com"
  GEMINI_MODEL = "gemini-2.5-flash"
  PROCESSING_POLL_INTERVAL = 5   # seconds
  PROCESSING_TIMEOUT = 300       # 5 minutes

  VIDEO_ANALYSIS_PROMPT = <<~PROMPT.strip
    Analyze this screen recording video. Extract a detailed description of the bug or feature being demonstrated.
    Include:
    - Step-by-step actions the user takes
    - What goes wrong or what the feature request is about
    - Any error messages or UI issues visible
    - Expected vs actual behavior
  PROMPT

  ANALYSIS_PROMPT = VIDEO_ANALYSIS_PROMPT

  IMAGE_ANALYSIS_PROMPT = <<~PROMPT.strip
    Analyze this screenshot or image. Extract a detailed description of the bug or feature being shown.
    Include:
    - What the image shows (UI state, error messages, visual issues)
    - Any error messages or warnings visible
    - What appears to be wrong or what the feature request is about
    - Expected vs actual appearance/behavior
  PROMPT

  def self.media_mime?(mime)
    mime.start_with?("video/") || mime.start_with?("image/")
  end

  def self.image_mime?(mime)
    mime.start_with?("image/")
  end

  def self.analyze_media_attachments(attachments)
    return nil if Config::GEMINI_API_KEY.to_s.empty?

    media_attachments = attachments.select do |a|
      mime = a["mime_type"] || a[:mime_type] || ""
      media_mime?(mime)
    end

    return nil if media_attachments.empty?

    results = media_attachments.filter_map do |attachment|
      process_single_media(attachment)
    end

    return nil if results.empty?

    results.join("\n\n---\n\n")
  rescue => e
    puts "[VideoAnalyzer] Error: #{e.message}"
    nil
  end

  def self.analyze_video_attachments(attachments)
    return nil if Config::GEMINI_API_KEY.to_s.empty?

    video_attachments = attachments.select do |a|
      mime = a["mime_type"] || a[:mime_type] || ""
      mime.start_with?("video/")
    end

    return nil if video_attachments.empty?

    results = video_attachments.filter_map do |attachment|
      process_single_video(attachment)
    end

    return nil if results.empty?

    results.join("\n\n---\n\n")
  rescue => e
    puts "[VideoAnalyzer] Error: #{e.message}"
    nil
  end

  private

  def self.process_single_media(attachment)
    mime_type = attachment["mime_type"] || attachment[:mime_type] || ""
    if image_mime?(mime_type)
      process_single_image(attachment)
    else
      process_single_video(attachment)
    end
  end

  def self.process_single_image(attachment)
    url = attachment["url"] || attachment[:url]
    filename = attachment["filename"] || attachment[:filename] || "image.png"
    mime_type = attachment["mime_type"] || attachment[:mime_type] || "image/png"

    puts "[VideoAnalyzer] Processing image: #{filename} (#{mime_type})"

    input_path = download_file(url, filename)
    return nil unless input_path

    # Upload to Gemini Files API (no conversion needed for images)
    file_info = upload_to_gemini(input_path, mime_type, filename)
    return nil unless file_info

    file_name = file_info["name"]
    file_uri = file_info["uri"]

    # Wait for processing
    unless wait_for_processing(file_name)
      puts "[VideoAnalyzer] Image processing timed out"
      return nil
    end

    # Analyze with image-specific prompt
    analysis = analyze_with_gemini(file_uri, mime_type, IMAGE_ANALYSIS_PROMPT)
    puts "[VideoAnalyzer] Image analysis complete: #{analysis&.length || 0} chars"
    analysis
  rescue => e
    puts "[VideoAnalyzer] Error processing image #{filename}: #{e.message}"
    nil
  ensure
    delete_from_gemini(file_name) if file_name
    cleanup_temp_files(input_path)
  end

  def self.process_single_video(attachment)
    url = attachment["url"] || attachment[:url]
    filename = attachment["filename"] || attachment[:filename] || "video.webm"
    mime_type = attachment["mime_type"] || attachment[:mime_type] || "video/webm"

    puts "[VideoAnalyzer] Processing: #{filename} (#{mime_type})"

    input_path = download_file(url, filename)
    return nil unless input_path

    # Convert webm to mp4 for better Gemini compatibility
    converted_path, upload_mime = convert_to_mp4(input_path, mime_type)

    # Upload to Gemini Files API
    file_info = upload_to_gemini(converted_path, upload_mime, filename)
    return nil unless file_info

    file_name = file_info["name"]
    file_uri = file_info["uri"]

    # Wait for processing
    unless wait_for_processing(file_name)
      puts "[VideoAnalyzer] File processing timed out"
      return nil
    end

    # Analyze
    analysis = analyze_with_gemini(file_uri, upload_mime, VIDEO_ANALYSIS_PROMPT)
    puts "[VideoAnalyzer] Analysis complete: #{analysis&.length || 0} chars"
    analysis
  rescue => e
    puts "[VideoAnalyzer] Error processing #{filename}: #{e.message}"
    nil
  ensure
    delete_from_gemini(file_name) if file_name
    cleanup_temp_files(input_path, converted_path)
  end

  def self.safe_parse_uri(url)
    URI.parse(url)
  rescue URI::InvalidURIError
    # Handle URLs with unescaped characters by encoding the path and query
    parts = url.match(%r{\A(https?)://([^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?\z})
    return nil unless parts
    scheme, host, path, query, fragment = parts[1], parts[2], parts[3], parts[4], parts[5]
    encoded_path = URI::DEFAULT_PARSER.escape(path || "")
    clean = "#{scheme}://#{host}#{encoded_path}#{query}#{fragment}"
    URI.parse(clean)
  end

  def self.download_file(url, filename)
    puts "[VideoAnalyzer] Downloading: #{url}"
    uri = safe_parse_uri(url)
    return nil unless uri
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") do |http|
      request = Net::HTTP::Get.new(uri)
      http.request(request)
    end

    # Follow redirects (tmpfiles.org uses them)
    max_redirects = 5
    redirects = 0
    while response.is_a?(Net::HTTPRedirection) && redirects < max_redirects
      uri = safe_parse_uri(response["location"])
      break unless uri
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") do |http|
        request = Net::HTTP::Get.new(uri)
        http.request(request)
      end
      redirects += 1
    end

    unless response.is_a?(Net::HTTPSuccess)
      puts "[VideoAnalyzer] Download failed: HTTP #{response.code}"
      return nil
    end

    ext = File.extname(filename)
    ext = ".bin" if ext.empty?
    tmp = Tempfile.new(["media_input", ext])
    tmp.binmode
    tmp.write(response.body)
    tmp.close
    puts "[VideoAnalyzer] Downloaded: #{tmp.path} (#{response.body.length} bytes)"
    tmp.path
  rescue => e
    puts "[VideoAnalyzer] Download error: #{e.message}"
    nil
  end

  def self.convert_to_mp4(input_path, mime_type)
    # Only convert webm; other formats pass through
    unless mime_type.include?("webm")
      return [input_path, mime_type]
    end

    output_path = input_path.sub(/\.[^.]+\z/, "") + "_converted.mp4"
    cmd = "ffmpeg -y -i #{input_path.shellescape} -c:v libx264 -preset fast -crf 23 -c:a aac #{output_path.shellescape} 2>&1"
    puts "[VideoAnalyzer] Converting webm → mp4..."
    result = `#{cmd}`
    status = $?

    if status.success? && File.exist?(output_path) && File.size(output_path) > 0
      puts "[VideoAnalyzer] Conversion successful: #{File.size(output_path)} bytes"
      [output_path, "video/mp4"]
    else
      puts "[VideoAnalyzer] Conversion failed (exit #{status.exitstatus}), using original: #{result.lines.last}"
      [input_path, mime_type]
    end
  end

  def self.upload_to_gemini(file_path, mime_type, display_name)
    file_size = File.size(file_path)
    puts "[VideoAnalyzer] Uploading to Gemini: #{file_size} bytes, #{mime_type}"

    # Step 1: Initiate resumable upload
    uri = URI.parse("#{GEMINI_BASE}/upload/v1beta/files?key=#{Config::GEMINI_API_KEY}")
    metadata = { file: { display_name: display_name } }

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.read_timeout = 120

    init_request = Net::HTTP::Post.new(uri)
    init_request["X-Goog-Upload-Protocol"] = "resumable"
    init_request["X-Goog-Upload-Command"] = "start"
    init_request["X-Goog-Upload-Header-Content-Length"] = file_size.to_s
    init_request["X-Goog-Upload-Header-Content-Type"] = mime_type
    init_request["Content-Type"] = "application/json"
    init_request.body = JSON.generate(metadata)

    init_response = http.request(init_request)
    upload_url = init_response["x-goog-upload-url"]

    unless upload_url
      puts "[VideoAnalyzer] Failed to get upload URL: #{init_response.code} #{init_response.body}"
      return nil
    end

    # Step 2: Upload file bytes
    upload_uri = URI.parse(upload_url)
    upload_http = Net::HTTP.new(upload_uri.host, upload_uri.port)
    upload_http.use_ssl = (upload_uri.scheme == "https")
    upload_http.read_timeout = 300

    file_data = File.binread(file_path)
    upload_request = Net::HTTP::Post.new(upload_uri)
    upload_request["X-Goog-Upload-Command"] = "upload, finalize"
    upload_request["X-Goog-Upload-Offset"] = "0"
    upload_request["Content-Type"] = mime_type
    upload_request.body = file_data

    upload_response = upload_http.request(upload_request)

    unless upload_response.is_a?(Net::HTTPSuccess)
      puts "[VideoAnalyzer] Upload failed: #{upload_response.code} #{upload_response.body}"
      return nil
    end

    result = JSON.parse(upload_response.body)
    file_info = result["file"]
    puts "[VideoAnalyzer] Uploaded: #{file_info['name']} (#{file_info['state']})"
    file_info
  rescue => e
    puts "[VideoAnalyzer] Upload error: #{e.message}"
    nil
  end

  def self.wait_for_processing(file_name)
    puts "[VideoAnalyzer] Waiting for processing: #{file_name}"
    elapsed = 0

    while elapsed < PROCESSING_TIMEOUT
      uri = URI.parse("#{GEMINI_BASE}/v1beta/#{file_name}?key=#{Config::GEMINI_API_KEY}")
      response = Net::HTTP.get_response(uri)

      if response.is_a?(Net::HTTPSuccess)
        info = JSON.parse(response.body)
        state = info["state"]
        puts "[VideoAnalyzer] File state: #{state} (#{elapsed}s elapsed)"

        return true if state == "ACTIVE"

        if state == "FAILED"
          puts "[VideoAnalyzer] File processing failed"
          return false
        end
      else
        puts "[VideoAnalyzer] Poll error: #{response.code}"
      end

      sleep(PROCESSING_POLL_INTERVAL)
      elapsed += PROCESSING_POLL_INTERVAL
    end

    false
  end

  def self.analyze_with_gemini(file_uri, mime_type, prompt = ANALYSIS_PROMPT)
    puts "[VideoAnalyzer] Analyzing with #{GEMINI_MODEL}..."
    uri = URI.parse("#{GEMINI_BASE}/v1beta/models/#{GEMINI_MODEL}:generateContent?key=#{Config::GEMINI_API_KEY}")

    body = {
      contents: [{
        parts: [
          { file_data: { mime_type: mime_type, file_uri: file_uri } },
          { text: prompt }
        ]
      }]
    }

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.read_timeout = 120

    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    request.body = JSON.generate(body)

    response = http.request(request)

    unless response.is_a?(Net::HTTPSuccess)
      puts "[VideoAnalyzer] Gemini API error: #{response.code} #{response.body}"
      return nil
    end

    result = JSON.parse(response.body)
    candidates = result.dig("candidates")
    return nil unless candidates && !candidates.empty?

    text = candidates[0].dig("content", "parts", 0, "text")
    text
  rescue => e
    puts "[VideoAnalyzer] Analysis error: #{e.message}"
    nil
  end

  def self.delete_from_gemini(file_name)
    puts "[VideoAnalyzer] Deleting #{file_name} from Gemini..."
    uri = URI.parse("#{GEMINI_BASE}/v1beta/#{file_name}?key=#{Config::GEMINI_API_KEY}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    request = Net::HTTP::Delete.new(uri)
    response = http.request(request)
    if response.is_a?(Net::HTTPSuccess)
      puts "[VideoAnalyzer] Deleted #{file_name}"
    else
      puts "[VideoAnalyzer] Delete failed: #{response.code} #{response.body}"
    end
  rescue => e
    puts "[VideoAnalyzer] Delete error: #{e.message}"
  end

  def self.cleanup_temp_files(*paths)
    paths.compact.each do |path|
      File.delete(path) if File.exist?(path)
    rescue => e
      puts "[VideoAnalyzer] Cleanup error for #{path}: #{e.message}"
    end
  end
end
