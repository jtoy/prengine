require_relative "test_helper"
require_relative "../video_analyzer"

class VideoAnalyzerTest < Minitest::Test
  def test_returns_nil_when_no_gemini_key
    original = Config::GEMINI_API_KEY
    Config.send(:remove_const, :GEMINI_API_KEY) if Config.const_defined?(:GEMINI_API_KEY)
    Config.const_set(:GEMINI_API_KEY, "")

    result = VideoAnalyzer.analyze_video_attachments([
      { "url" => "http://test.com/vid.mp4", "mime_type" => "video/mp4", "filename" => "vid.mp4" }
    ])
    assert_nil result
  ensure
    Config.send(:remove_const, :GEMINI_API_KEY)
    Config.const_set(:GEMINI_API_KEY, original)
  end

  def test_returns_nil_for_empty_attachments
    result = VideoAnalyzer.analyze_video_attachments([])
    assert_nil result
  end

  def test_returns_nil_when_no_video_attachments
    attachments = [
      { "url" => "http://test.com/img.png", "mime_type" => "image/png", "filename" => "img.png" }
    ]
    result = VideoAnalyzer.analyze_video_attachments(attachments)
    assert_nil result
  end

  def test_convert_to_mp4_returns_original_for_non_webm
    path = "/tmp/test_video.mp4"
    File.write(path, "fake video data")

    result_path, result_mime = VideoAnalyzer.send(:convert_to_mp4, path, "video/mp4")
    assert_equal path, result_path
    assert_equal "video/mp4", result_mime
  ensure
    File.delete(path) if File.exist?(path)
  end

  def test_cleanup_temp_files_handles_nonexistent
    # Should not raise
    VideoAnalyzer.send(:cleanup_temp_files, "/tmp/nonexistent_file_12345", nil)
  end

  def test_analysis_prompt_is_defined
    refute VideoAnalyzer::ANALYSIS_PROMPT.empty?
    assert_includes VideoAnalyzer::ANALYSIS_PROMPT, "screen recording"
  end

  def test_image_analysis_prompt_is_defined
    refute VideoAnalyzer::IMAGE_ANALYSIS_PROMPT.empty?
    assert_includes VideoAnalyzer::IMAGE_ANALYSIS_PROMPT, "screenshot"
  end

  # --- analyze_media_attachments ---

  def test_analyze_media_returns_nil_when_no_gemini_key
    original = Config::GEMINI_API_KEY
    Config.send(:remove_const, :GEMINI_API_KEY) if Config.const_defined?(:GEMINI_API_KEY)
    Config.const_set(:GEMINI_API_KEY, "")

    result = VideoAnalyzer.analyze_media_attachments([
      { "url" => "http://test.com/img.png", "mime_type" => "image/png", "filename" => "img.png" }
    ])
    assert_nil result
  ensure
    Config.send(:remove_const, :GEMINI_API_KEY)
    Config.const_set(:GEMINI_API_KEY, original)
  end

  def test_analyze_media_returns_nil_for_empty_attachments
    result = VideoAnalyzer.analyze_media_attachments([])
    assert_nil result
  end

  def test_analyze_media_returns_nil_for_non_media_attachments
    attachments = [
      { "url" => "http://test.com/file.txt", "mime_type" => "text/plain", "filename" => "file.txt" }
    ]
    result = VideoAnalyzer.analyze_media_attachments(attachments)
    assert_nil result
  end

  def test_analyze_media_includes_both_video_and_image
    # Stub process_single_media to return a string
    VideoAnalyzer.define_singleton_method(:process_single_media) do |att|
      "analyzed-#{att['filename']}"
    end

    attachments = [
      { "url" => "http://test.com/vid.mp4", "mime_type" => "video/mp4", "filename" => "vid.mp4" },
      { "url" => "http://test.com/img.png", "mime_type" => "image/png", "filename" => "img.png" },
    ]
    result = VideoAnalyzer.analyze_media_attachments(attachments)
    assert_includes result, "analyzed-vid.mp4"
    assert_includes result, "analyzed-img.png"
  ensure
    # Remove the stub — the original is private, re-require to restore
    VideoAnalyzer.singleton_class.send(:remove_method, :process_single_media) rescue nil
  end

  # --- media_mime? and image_mime? ---

  def test_media_mime_detects_video
    assert VideoAnalyzer.media_mime?("video/mp4")
  end

  def test_media_mime_detects_image
    assert VideoAnalyzer.media_mime?("image/png")
  end

  def test_media_mime_rejects_text
    refute VideoAnalyzer.media_mime?("text/plain")
  end

  def test_image_mime_detects_image
    assert VideoAnalyzer.image_mime?("image/jpeg")
  end

  def test_image_mime_rejects_video
    refute VideoAnalyzer.image_mime?("video/mp4")
  end

  # --- convert_to_mp4 passthrough for images ---

  def test_convert_to_mp4_returns_original_for_image
    path = "/tmp/test_image.png"
    File.write(path, "fake image data")

    result_path, result_mime = VideoAnalyzer.send(:convert_to_mp4, path, "image/png")
    assert_equal path, result_path
    assert_equal "image/png", result_mime
  ensure
    File.delete(path) if File.exist?(path)
  end

  # --- safe_parse_uri ---

  def test_safe_parse_uri_handles_normal_url
    uri = VideoAnalyzer.send(:safe_parse_uri, "https://example.com/video.mp4")
    assert_equal "example.com", uri.host
    assert_equal "/video.mp4", uri.path
  end

  def test_safe_parse_uri_handles_url_with_query_params
    url = "https://assets.distark.com/shows/studyturtle/artifacts/videos/BUGS/test.mp4?t=1773721587222"
    uri = VideoAnalyzer.send(:safe_parse_uri, url)
    assert_equal "assets.distark.com", uri.host
    assert_includes uri.to_s, "t=1773721587222"
  end

  def test_safe_parse_uri_returns_nil_for_garbage
    uri = VideoAnalyzer.send(:safe_parse_uri, "not a url at all")
    assert_nil uri
  end
end
