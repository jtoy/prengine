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
end
