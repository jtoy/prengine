#!/usr/bin/env ruby
# Full test suite for VideoAnalyzer
# Unit tests use stubbed HTTP; integration tests hit real Gemini API.
#
# Run all unit tests:
#   ruby test_video_analyzer.rb
#
# Run including live integration tests (requires real GEMINI_API_KEY + ffmpeg):
#   LIVE=1 GEMINI_API_KEY=AIza... ruby test_video_analyzer.rb

$stdout.sync = true
ENV["GEMINI_API_KEY"] ||= "test-key-placeholder"

require "minitest/autorun"
require "webrick"
require "tempfile"
require "json"
require "net/http"

# Load VideoAnalyzer (pulls in config.rb)
require_relative "video_analyzer"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Spin up a throwaway WEBrick on a random port, yield the base URL, shut down.
def with_local_server(responses = {})
  server = WEBrick::HTTPServer.new(Port: 0, Logger: WEBrick::Log.new("/dev/null"), AccessLog: [])
  port = server.config[:Port]

  responses.each do |path, handler|
    server.mount_proc(path, handler)
  end

  thread = Thread.new { server.start }
  sleep 0.1
  begin
    yield "http://127.0.0.1:#{port}"
  ensure
    server.shutdown
    thread.join(2)
  end
end

def make_temp_video(ext = ".mp4", size = 128)
  tmp = Tempfile.new(["test_vid", ext])
  tmp.binmode
  tmp.write("\x00" * size)
  tmp.close
  tmp.path
end

# Stub a VideoAnalyzer class method for the duration of the block.
# Pass a lambda/proc as the implementation.
def stub_va(name, impl)
  original = VideoAnalyzer.method(name)
  VideoAnalyzer.define_singleton_method(name, impl)
  yield
ensure
  VideoAnalyzer.define_singleton_method(name, original)
end

def stub_const_base(base)
  original = VideoAnalyzer::GEMINI_BASE
  VideoAnalyzer.send(:remove_const, :GEMINI_BASE)
  VideoAnalyzer.const_set(:GEMINI_BASE, base)
  yield
ensure
  VideoAnalyzer.send(:remove_const, :GEMINI_BASE)
  VideoAnalyzer.const_set(:GEMINI_BASE, original)
end

def with_api_key(key)
  original = Config::GEMINI_API_KEY
  Config.send(:remove_const, :GEMINI_API_KEY)
  Config.const_set(:GEMINI_API_KEY, key)
  yield
ensure
  Config.send(:remove_const, :GEMINI_API_KEY)
  Config.const_set(:GEMINI_API_KEY, original)
end

# ---------------------------------------------------------------------------
# Unit Tests — analyze_video_attachments
# ---------------------------------------------------------------------------

class TestAnalyzeVideoAttachments < Minitest::Test
  def test_returns_nil_when_api_key_empty
    with_api_key("") do
      result = VideoAnalyzer.analyze_video_attachments([{ "mime_type" => "video/webm", "url" => "http://x" }])
      assert_nil result
    end
  end

  def test_returns_nil_for_empty_attachments
    assert_nil VideoAnalyzer.analyze_video_attachments([])
  end

  def test_returns_nil_when_no_video_attachments
    attachments = [{ "mime_type" => "image/png", "url" => "http://x/img.png" }]
    assert_nil VideoAnalyzer.analyze_video_attachments(attachments)
  end

  def test_filters_only_video_attachments
    calls = []
    impl = ->(att) { calls << att; "analysis for #{att['filename']}" }
    stub_va(:process_single_video, impl) do
      attachments = [
        { "mime_type" => "image/png", "url" => "http://x/img.png", "filename" => "img.png" },
        { "mime_type" => "video/webm", "url" => "http://x/vid.webm", "filename" => "vid.webm" },
        { "mime_type" => "video/mp4", "url" => "http://x/vid.mp4", "filename" => "vid.mp4" },
      ]
      result = VideoAnalyzer.analyze_video_attachments(attachments)
      assert_equal 2, calls.length
      assert_includes result, "analysis for vid.webm"
      assert_includes result, "analysis for vid.mp4"
    end
  end

  def test_joins_multiple_results_with_separator
    stub_va(:process_single_video, ->(att) { "result-#{att['filename']}" }) do
      attachments = [
        { "mime_type" => "video/webm", "url" => "http://x/a.webm", "filename" => "a.webm" },
        { "mime_type" => "video/mp4", "url" => "http://x/b.mp4", "filename" => "b.mp4" },
      ]
      result = VideoAnalyzer.analyze_video_attachments(attachments)
      assert_equal "result-a.webm\n\n---\n\nresult-b.mp4", result
    end
  end

  def test_returns_nil_when_all_process_calls_return_nil
    stub_va(:process_single_video, ->(_) { nil }) do
      attachments = [{ "mime_type" => "video/webm", "url" => "http://x/v.webm" }]
      assert_nil VideoAnalyzer.analyze_video_attachments(attachments)
    end
  end

  def test_handles_symbol_keys
    stub_va(:process_single_video, ->(_) { "ok" }) do
      attachments = [{ mime_type: "video/webm", url: "http://x/v.webm", filename: "v.webm" }]
      assert_equal "ok", VideoAnalyzer.analyze_video_attachments(attachments)
    end
  end

  def test_rescues_unexpected_errors_gracefully
    stub_va(:process_single_video, ->(_) { raise "boom" }) do
      attachments = [{ "mime_type" => "video/webm", "url" => "http://x/v.webm" }]
      result = VideoAnalyzer.analyze_video_attachments(attachments)
      assert_nil result
    end
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — download_file
# ---------------------------------------------------------------------------

class TestDownloadFile < Minitest::Test
  def test_downloads_successfully
    responses = {
      "/video.webm" => proc { |_req, res| res.body = "fakevideo"; res["Content-Type"] = "video/webm" }
    }
    with_local_server(responses) do |base|
      path = VideoAnalyzer.send(:download_file, "#{base}/video.webm", "video.webm")
      assert path
      assert File.exist?(path)
      assert_equal "fakevideo", File.read(path)
      File.delete(path)
    end
  end

  def test_follows_redirects
    responses = {
      "/redir" => proc { |_req, res| res.status = 302; res["Location"] = "/final" },
      "/final" => proc { |_req, res| res.body = "redirected_content" }
    }
    with_local_server(responses) do |base|
      path = VideoAnalyzer.send(:download_file, "#{base}/redir", "video.webm")
      assert path
      assert_equal "redirected_content", File.read(path)
      File.delete(path)
    end
  end

  def test_returns_nil_on_404
    responses = {
      "/missing" => proc { |_req, res| res.status = 404; res.body = "not found" }
    }
    with_local_server(responses) do |base|
      path = VideoAnalyzer.send(:download_file, "#{base}/missing", "video.webm")
      assert_nil path
    end
  end

  def test_returns_nil_on_network_error
    path = VideoAnalyzer.send(:download_file, "http://127.0.0.1:1/nope", "video.webm")
    assert_nil path
  end

  def test_uses_webm_extension_when_filename_has_no_ext
    responses = {
      "/vid" => proc { |_req, res| res.body = "data" }
    }
    with_local_server(responses) do |base|
      path = VideoAnalyzer.send(:download_file, "#{base}/vid", "noext")
      assert path
      assert path.end_with?(".webm")
      File.delete(path)
    end
  end

  def test_max_redirects_limit
    responses = {}
    (0..9).each do |i|
      responses["/r#{i}"] = proc { |_req, res| res.status = 302; res["Location"] = "/r#{i + 1}" }
    end
    responses["/r10"] = proc { |_req, res| res.body = "final" }

    with_local_server(responses) do |base|
      path = VideoAnalyzer.send(:download_file, "#{base}/r0", "video.webm")
      # After 5 redirects we still get a redirect (not HTTPSuccess) → nil
      assert_nil path
    end
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — convert_to_mp4
# ---------------------------------------------------------------------------

class TestConvertToMp4 < Minitest::Test
  def test_passthrough_for_non_webm_mp4
    path = make_temp_video(".mp4")
    result_path, result_mime = VideoAnalyzer.send(:convert_to_mp4, path, "video/mp4")
    assert_equal path, result_path
    assert_equal "video/mp4", result_mime
    File.delete(path) if File.exist?(path)
  end

  def test_passthrough_for_quicktime
    path = make_temp_video(".mov")
    result_path, result_mime = VideoAnalyzer.send(:convert_to_mp4, path, "video/quicktime")
    assert_equal path, result_path
    assert_equal "video/quicktime", result_mime
    File.delete(path) if File.exist?(path)
  end

  def test_converts_real_webm_with_ffmpeg
    webm_path = "/tmp/test_va_convert_#{$$}.webm"
    `ffmpeg -y -f lavfi -i "color=c=red:s=64x64:d=1" -c:v libvpx -pix_fmt yuv420p #{webm_path} 2>&1`
    skip "ffmpeg/libvpx not available" unless $?.success? && File.exist?(webm_path)

    result_path, result_mime = VideoAnalyzer.send(:convert_to_mp4, webm_path, "video/webm")
    assert_equal "video/mp4", result_mime
    refute_equal webm_path, result_path
    assert File.exist?(result_path)
    assert File.size(result_path) > 0
  ensure
    File.delete(webm_path) if webm_path && File.exist?(webm_path)
    File.delete(result_path) if result_path && result_path != webm_path && File.exist?(result_path)
  end

  def test_falls_back_on_invalid_input
    bad = make_temp_video(".webm", 16)
    result_path, result_mime = VideoAnalyzer.send(:convert_to_mp4, bad, "video/webm")
    assert_equal bad, result_path
    assert_equal "video/webm", result_mime
    File.delete(bad) if File.exist?(bad)
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — upload_to_gemini
# ---------------------------------------------------------------------------

class TestUploadToGemini < Minitest::Test
  def test_returns_nil_when_init_has_no_upload_url
    responses = {
      "/upload/v1beta/files" => proc { |_req, res| res.status = 200; res.body = "{}" }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        path = make_temp_video
        result = VideoAnalyzer.send(:upload_to_gemini, path, "video/mp4", "test.mp4")
        assert_nil result
        File.delete(path)
      end
    end
  end

  def test_returns_nil_on_upload_step_failure
    responses = {
      "/upload/v1beta/files" => proc { |_req, res|
        res.status = 200
        res["x-goog-upload-url"] = "http://127.0.0.1:1/unreachable"
        res.body = "{}"
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        path = make_temp_video
        result = VideoAnalyzer.send(:upload_to_gemini, path, "video/mp4", "test.mp4")
        assert_nil result
        File.delete(path)
      end
    end
  end

  def test_successful_two_step_upload
    upload_body_received = nil
    responses = {
      "/upload/v1beta/files" => proc { |req, res|
        # Extract port from Host header for the upload URL
        host_port = req["Host"] || "127.0.0.1"
        res.status = 200
        res["x-goog-upload-url"] = "http://#{host_port}/do-upload"
        res.body = "{}"
      },
      "/do-upload" => proc { |req, res|
        upload_body_received = req.body
        res.status = 200
        res.body = JSON.generate({
          "file" => { "name" => "files/abc123", "state" => "PROCESSING", "uri" => "gs://abc123" }
        })
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        path = make_temp_video(".mp4", 64)
        result = VideoAnalyzer.send(:upload_to_gemini, path, "video/mp4", "test.mp4")
        assert result
        assert_equal "files/abc123", result["name"]
        assert_equal "PROCESSING", result["state"]
        assert_equal "\x00" * 64, upload_body_received
        File.delete(path)
      end
    end
  end

  def test_sends_correct_headers_on_init
    init_headers = {}
    responses = {
      "/upload/v1beta/files" => proc { |req, res|
        init_headers["protocol"] = req["X-Goog-Upload-Protocol"]
        init_headers["command"] = req["X-Goog-Upload-Command"]
        init_headers["content_type"] = req["Content-Type"]
        init_headers["upload_content_type"] = req["X-Goog-Upload-Header-Content-Type"]
        res.status = 200
        res.body = "{}"
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        path = make_temp_video
        VideoAnalyzer.send(:upload_to_gemini, path, "video/mp4", "test.mp4")
        assert_equal "resumable", init_headers["protocol"]
        assert_equal "start", init_headers["command"]
        assert_equal "application/json", init_headers["content_type"]
        assert_equal "video/mp4", init_headers["upload_content_type"]
        File.delete(path)
      end
    end
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — wait_for_processing
# ---------------------------------------------------------------------------

class TestWaitForProcessing < Minitest::Test
  def setup
    @orig_interval = VideoAnalyzer::PROCESSING_POLL_INTERVAL
    @orig_timeout = VideoAnalyzer::PROCESSING_TIMEOUT
    VideoAnalyzer.send(:remove_const, :PROCESSING_POLL_INTERVAL)
    VideoAnalyzer.const_set(:PROCESSING_POLL_INTERVAL, 0.05)
    VideoAnalyzer.send(:remove_const, :PROCESSING_TIMEOUT)
    VideoAnalyzer.const_set(:PROCESSING_TIMEOUT, 0.5)
  end

  def teardown
    VideoAnalyzer.send(:remove_const, :PROCESSING_POLL_INTERVAL)
    VideoAnalyzer.const_set(:PROCESSING_POLL_INTERVAL, @orig_interval)
    VideoAnalyzer.send(:remove_const, :PROCESSING_TIMEOUT)
    VideoAnalyzer.const_set(:PROCESSING_TIMEOUT, @orig_timeout)
  end

  def test_returns_true_when_immediately_active
    responses = {
      "/v1beta/files/abc" => proc { |_req, res| res.body = JSON.generate({ "state" => "ACTIVE" }) }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        assert VideoAnalyzer.send(:wait_for_processing, "files/abc")
      end
    end
  end

  def test_returns_true_after_several_processing_polls
    call_count = 0
    responses = {
      "/v1beta/files/abc" => proc { |_req, res|
        call_count += 1
        state = call_count >= 3 ? "ACTIVE" : "PROCESSING"
        res.body = JSON.generate({ "state" => state })
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        assert VideoAnalyzer.send(:wait_for_processing, "files/abc")
        assert call_count >= 3
      end
    end
  end

  def test_returns_false_on_failed_state
    responses = {
      "/v1beta/files/abc" => proc { |_req, res| res.body = JSON.generate({ "state" => "FAILED" }) }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        refute VideoAnalyzer.send(:wait_for_processing, "files/abc")
      end
    end
  end

  def test_returns_false_on_timeout
    responses = {
      "/v1beta/files/abc" => proc { |_req, res| res.body = JSON.generate({ "state" => "PROCESSING" }) }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        refute VideoAnalyzer.send(:wait_for_processing, "files/abc")
      end
    end
  end

  def test_handles_poll_http_errors
    call_count = 0
    responses = {
      "/v1beta/files/abc" => proc { |_req, res|
        call_count += 1
        if call_count <= 2
          res.status = 500; res.body = "error"
        else
          res.body = JSON.generate({ "state" => "ACTIVE" })
        end
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        assert VideoAnalyzer.send(:wait_for_processing, "files/abc")
        assert call_count >= 3
      end
    end
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — analyze_with_gemini
# ---------------------------------------------------------------------------

class TestAnalyzeWithGemini < Minitest::Test
  def test_returns_text_on_success
    responses = {
      "/v1beta/models/gemini-2.5-flash:generateContent" => proc { |_req, res|
        res.body = JSON.generate({
          "candidates" => [{ "content" => { "parts" => [{ "text" => "Bug: button misaligned" }] } }]
        })
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        result = VideoAnalyzer.send(:analyze_with_gemini, "gs://fake", "video/mp4")
        assert_equal "Bug: button misaligned", result
      end
    end
  end

  def test_sends_correct_request_body
    received_body = nil
    responses = {
      "/v1beta/models/gemini-2.5-flash:generateContent" => proc { |req, res|
        received_body = JSON.parse(req.body)
        res.body = JSON.generate({
          "candidates" => [{ "content" => { "parts" => [{ "text" => "ok" }] } }]
        })
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        VideoAnalyzer.send(:analyze_with_gemini, "gs://test-uri", "video/webm")
        parts = received_body.dig("contents", 0, "parts")
        assert_equal 2, parts.length
        assert_equal "gs://test-uri", parts[0].dig("file_data", "file_uri")
        assert_equal "video/webm", parts[0].dig("file_data", "mime_type")
        assert_includes parts[1]["text"], "Analyze this screen recording"
      end
    end
  end

  def test_returns_nil_on_api_error
    responses = {
      "/v1beta/models/gemini-2.5-flash:generateContent" => proc { |_req, res|
        res.status = 500; res.body = "internal error"
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        assert_nil VideoAnalyzer.send(:analyze_with_gemini, "gs://fake", "video/mp4")
      end
    end
  end

  def test_returns_nil_on_empty_candidates
    responses = {
      "/v1beta/models/gemini-2.5-flash:generateContent" => proc { |_req, res|
        res.body = JSON.generate({ "candidates" => [] })
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        assert_nil VideoAnalyzer.send(:analyze_with_gemini, "gs://fake", "video/mp4")
      end
    end
  end

  def test_returns_nil_on_missing_candidates_key
    responses = {
      "/v1beta/models/gemini-2.5-flash:generateContent" => proc { |_req, res|
        res.body = JSON.generate({ "other" => "stuff" })
      }
    }
    with_local_server(responses) do |base|
      stub_const_base(base) do
        assert_nil VideoAnalyzer.send(:analyze_with_gemini, "gs://fake", "video/mp4")
      end
    end
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — delete_from_gemini
# ---------------------------------------------------------------------------

class DeleteServlet < WEBrick::HTTPServlet::AbstractServlet
  @@delete_received = false
  def self.delete_received; @@delete_received; end
  def self.reset!; @@delete_received = false; end

  def do_DELETE(_req, res)
    @@delete_received = true
    res.status = 200
    res.body = "{}"
  end
end

class NotFoundDeleteServlet < WEBrick::HTTPServlet::AbstractServlet
  def do_DELETE(_req, res)
    res.status = 404
    res.body = "not found"
  end
end

class TestDeleteFromGemini < Minitest::Test
  def test_sends_delete_request
    DeleteServlet.reset!
    server = WEBrick::HTTPServer.new(Port: 0, Logger: WEBrick::Log.new("/dev/null"), AccessLog: [])
    port = server.config[:Port]
    server.mount("/v1beta/files/xyz", DeleteServlet)
    thread = Thread.new { server.start }
    sleep 0.1

    stub_const_base("http://127.0.0.1:#{port}") do
      VideoAnalyzer.send(:delete_from_gemini, "files/xyz")
      assert DeleteServlet.delete_received, "DELETE request should be received"
    end
  ensure
    server&.shutdown
    thread&.join(2)
  end

  def test_does_not_raise_on_404
    server = WEBrick::HTTPServer.new(Port: 0, Logger: WEBrick::Log.new("/dev/null"), AccessLog: [])
    port = server.config[:Port]
    server.mount("/v1beta/files/xyz", NotFoundDeleteServlet)
    thread = Thread.new { server.start }
    sleep 0.1

    stub_const_base("http://127.0.0.1:#{port}") do
      VideoAnalyzer.send(:delete_from_gemini, "files/xyz")
    end
  ensure
    server&.shutdown
    thread&.join(2)
  end

  def test_does_not_raise_on_network_error
    stub_const_base("http://127.0.0.1:1") do
      VideoAnalyzer.send(:delete_from_gemini, "files/xyz")
    end
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — cleanup_temp_files
# ---------------------------------------------------------------------------

class TestCleanupTempFiles < Minitest::Test
  def test_deletes_existing_files
    f1 = Tempfile.new("cleanup1"); f1.close
    f2 = Tempfile.new("cleanup2"); f2.close
    p1, p2 = f1.path, f2.path

    VideoAnalyzer.send(:cleanup_temp_files, p1, p2)
    refute File.exist?(p1)
    refute File.exist?(p2)
  end

  def test_ignores_nil_paths
    VideoAnalyzer.send(:cleanup_temp_files, nil, nil)
  end

  def test_ignores_nonexistent_paths
    VideoAnalyzer.send(:cleanup_temp_files, "/tmp/does_not_exist_#{$$}_#{rand(99999)}")
  end

  def test_handles_mixed_nil_real_and_missing
    f = Tempfile.new("cleanup_mix"); f.close
    p = f.path
    VideoAnalyzer.send(:cleanup_temp_files, nil, p, "/tmp/nope_#{$$}")
    refute File.exist?(p)
  end
end

# ---------------------------------------------------------------------------
# Unit Tests — process_single_video (orchestration)
# ---------------------------------------------------------------------------

class TestProcessSingleVideo < Minitest::Test
  NOOP = ->(*_) { nil }

  def test_returns_nil_when_download_fails
    stub_va(:download_file, ->(*_) { nil }) do
      stub_va(:delete_from_gemini, NOOP) do
        stub_va(:cleanup_temp_files, NOOP) do
          att = { "url" => "http://bad", "filename" => "v.webm", "mime_type" => "video/webm" }
          assert_nil VideoAnalyzer.send(:process_single_video, att)
        end
      end
    end
  end

  def test_returns_nil_when_upload_fails
    tmp = make_temp_video(".webm")
    stub_va(:download_file, ->(*_) { tmp }) do
      stub_va(:convert_to_mp4, ->(p, m) { [p, m] }) do
        stub_va(:upload_to_gemini, ->(*_) { nil }) do
          stub_va(:delete_from_gemini, NOOP) do
            stub_va(:cleanup_temp_files, NOOP) do
              att = { "url" => "http://x", "filename" => "v.webm", "mime_type" => "video/webm" }
              assert_nil VideoAnalyzer.send(:process_single_video, att)
            end
          end
        end
      end
    end
    File.delete(tmp) if File.exist?(tmp)
  end

  def test_returns_nil_when_processing_times_out
    tmp = make_temp_video(".mp4")
    fi = { "name" => "files/abc", "uri" => "gs://abc" }
    stub_va(:download_file, ->(*_) { tmp }) do
      stub_va(:convert_to_mp4, ->(p, _m) { [p, "video/mp4"] }) do
        stub_va(:upload_to_gemini, ->(*_) { fi }) do
          stub_va(:wait_for_processing, ->(_) { false }) do
            stub_va(:delete_from_gemini, NOOP) do
              stub_va(:cleanup_temp_files, NOOP) do
                att = { "url" => "http://x", "filename" => "v.mp4", "mime_type" => "video/mp4" }
                assert_nil VideoAnalyzer.send(:process_single_video, att)
              end
            end
          end
        end
      end
    end
    File.delete(tmp) if File.exist?(tmp)
  end

  def test_full_pipeline_returns_analysis_and_deletes_from_gemini
    tmp = make_temp_video(".mp4")
    fi = { "name" => "files/abc", "uri" => "gs://abc" }
    deleted = []

    stub_va(:download_file, ->(*_) { tmp }) do
      stub_va(:convert_to_mp4, ->(p, _m) { [p, "video/mp4"] }) do
        stub_va(:upload_to_gemini, ->(*_) { fi }) do
          stub_va(:wait_for_processing, ->(_) { true }) do
            stub_va(:analyze_with_gemini, ->(*_) { "The button is misaligned" }) do
              stub_va(:delete_from_gemini, ->(name) { deleted << name }) do
                stub_va(:cleanup_temp_files, NOOP) do
                  att = { "url" => "http://x", "filename" => "v.mp4", "mime_type" => "video/mp4" }
                  result = VideoAnalyzer.send(:process_single_video, att)
                  assert_equal "The button is misaligned", result
                  assert_includes deleted, "files/abc"
                end
              end
            end
          end
        end
      end
    end
    File.delete(tmp) if File.exist?(tmp)
  end

  def test_ensure_block_cleans_up_on_exception
    tmp = make_temp_video(".mp4")
    cleaned = []
    deleted = []

    stub_va(:download_file, ->(*_) { tmp }) do
      stub_va(:convert_to_mp4, ->(p, _m) { [p, "video/mp4"] }) do
        stub_va(:upload_to_gemini, ->(*_) { raise "kaboom" }) do
          stub_va(:delete_from_gemini, ->(n) { deleted << n }) do
            stub_va(:cleanup_temp_files, ->(*paths) { cleaned.concat(paths.compact) }) do
              att = { "url" => "http://x", "filename" => "v.mp4", "mime_type" => "video/mp4" }
              result = VideoAnalyzer.send(:process_single_video, att)
              assert_nil result
              assert cleaned.include?(tmp), "temp files should be cleaned up after error"
            end
          end
        end
      end
    end
    File.delete(tmp) if File.exist?(tmp)
  end

  def test_uses_default_filename_and_mime_when_missing
    stub_va(:download_file, ->(*_) { nil }) do
      stub_va(:delete_from_gemini, NOOP) do
        stub_va(:cleanup_temp_files, NOOP) do
          att = { "url" => "http://x" }
          result = VideoAnalyzer.send(:process_single_video, att)
          assert_nil result
        end
      end
    end
  end
end

# ---------------------------------------------------------------------------
# Integration Tests (LIVE=1)
# ---------------------------------------------------------------------------

if ENV["LIVE"] == "1"
  real_key = ENV["GEMINI_API_KEY"]
  if real_key.nil? || real_key.empty? || real_key == "test-key-placeholder"
    puts "\nWARN: LIVE=1 set but no real GEMINI_API_KEY — skipping integration tests"
  else
    class TestLiveIntegration < Minitest::Test
      def setup
        with_real_key
      end

      def teardown
        restore_key
      end

      def test_live_upload_analyze_delete
        video_path = "/tmp/test_va_live_#{$$}.mp4"
        `ffmpeg -y -f lavfi -i "color=c=green:s=160x120:d=2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p #{video_path} 2>&1`
        skip "ffmpeg not available" unless $?.success? && File.exist?(video_path)

        file_info = VideoAnalyzer.send(:upload_to_gemini, video_path, "video/mp4", "live_test.mp4")
        assert file_info, "Upload should succeed"

        assert VideoAnalyzer.send(:wait_for_processing, file_info["name"]), "Should become ACTIVE"

        analysis = VideoAnalyzer.send(:analyze_with_gemini, file_info["uri"], "video/mp4")
        assert analysis, "Should return analysis text"
        assert analysis.length > 10, "Analysis should be substantive"

        VideoAnalyzer.send(:delete_from_gemini, file_info["name"])

        # Verify deletion
        sleep 1
        uri = URI.parse("#{VideoAnalyzer::GEMINI_BASE}/v1beta/#{file_info['name']}?key=#{Config::GEMINI_API_KEY}")
        resp = Net::HTTP.get_response(uri)
        assert(!resp.is_a?(Net::HTTPSuccess) || resp.body.include?("NOT_FOUND"),
               "File should be deleted from Gemini")
      ensure
        File.delete(video_path) if video_path && File.exist?(video_path)
      end

      def test_live_webm_to_mp4_pipeline
        webm_path = "/tmp/test_va_live_#{$$}.webm"
        `ffmpeg -y -f lavfi -i "color=c=yellow:s=160x120:d=2" -c:v libvpx -pix_fmt yuv420p #{webm_path} 2>&1`
        skip "ffmpeg/libvpx not available" unless $?.success? && File.exist?(webm_path)

        mp4_path, mime = VideoAnalyzer.send(:convert_to_mp4, webm_path, "video/webm")
        assert_equal "video/mp4", mime
        assert File.size(mp4_path) > 0

        file_info = VideoAnalyzer.send(:upload_to_gemini, mp4_path, "video/mp4", "webm_test.mp4")
        assert file_info
        assert VideoAnalyzer.send(:wait_for_processing, file_info["name"])

        analysis = VideoAnalyzer.send(:analyze_with_gemini, file_info["uri"], "video/mp4")
        assert analysis

        VideoAnalyzer.send(:delete_from_gemini, file_info["name"])
      ensure
        File.delete(webm_path) if webm_path && File.exist?(webm_path)
        File.delete(mp4_path) if mp4_path && mp4_path != webm_path && File.exist?(mp4_path)
      end

      private

      def with_real_key
        @saved_key = Config::GEMINI_API_KEY
        Config.send(:remove_const, :GEMINI_API_KEY)
        Config.const_set(:GEMINI_API_KEY, ENV["GEMINI_API_KEY"])
      end

      def restore_key
        Config.send(:remove_const, :GEMINI_API_KEY)
        Config.const_set(:GEMINI_API_KEY, @saved_key)
      end
    end
  end
end
