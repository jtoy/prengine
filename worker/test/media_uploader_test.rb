require_relative "test_helper"
require_relative "../media_uploader"

class MediaUploaderTest < Minitest::Test
  def setup
    @tmp_file = Tempfile.new(["test_upload", ".mp4"])
    @tmp_file.write("fake video data")
    @tmp_file.close
  end

  def teardown
    @tmp_file.unlink if @tmp_file
  end

  def test_upload_returns_url_on_success
    response_body = { "url" => "https://orca.distark.com/media/abc123.mp4" }.to_json
    mock_response = stub(is_a?: true, body: response_body, code: "200")
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(true)

    mock_http = mock("http")
    mock_http.stubs(:use_ssl=)
    mock_http.stubs(:read_timeout=)
    mock_http.expects(:request).returns(mock_response)

    Net::HTTP.stubs(:new).returns(mock_http)

    url = MediaUploader.upload(@tmp_file.path)
    assert_equal "https://orca.distark.com/media/abc123.mp4", url
  end

  def test_upload_returns_nil_when_no_token
    original = Config::DISTARK_TOKEN
    Config.send(:remove_const, :DISTARK_TOKEN)
    Config.const_set(:DISTARK_TOKEN, "")

    result = MediaUploader.upload(@tmp_file.path)
    assert_nil result
  ensure
    Config.send(:remove_const, :DISTARK_TOKEN)
    Config.const_set(:DISTARK_TOKEN, original)
  end

  def test_upload_returns_nil_when_file_not_found
    result = MediaUploader.upload("/tmp/nonexistent_file_12345.mp4")
    assert_nil result
  end

  def test_upload_returns_nil_on_http_error
    mock_response = stub(code: "500", body: "Internal Server Error")
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(false)

    mock_http = mock("http")
    mock_http.stubs(:use_ssl=)
    mock_http.stubs(:read_timeout=)
    mock_http.expects(:request).returns(mock_response)

    Net::HTTP.stubs(:new).returns(mock_http)

    result = MediaUploader.upload(@tmp_file.path)
    assert_nil result
  end

  def test_detect_mime_mp4
    assert_equal "video/mp4", MediaUploader.detect_mime("video.mp4")
  end

  def test_detect_mime_webm
    assert_equal "video/webm", MediaUploader.detect_mime("video.webm")
  end

  def test_detect_mime_png
    assert_equal "image/png", MediaUploader.detect_mime("screenshot.png")
  end

  def test_detect_mime_jpg
    assert_equal "image/jpeg", MediaUploader.detect_mime("photo.jpg")
  end

  def test_detect_mime_jpeg
    assert_equal "image/jpeg", MediaUploader.detect_mime("photo.jpeg")
  end

  def test_detect_mime_gif
    assert_equal "image/gif", MediaUploader.detect_mime("anim.gif")
  end

  def test_detect_mime_unknown
    assert_equal "application/octet-stream", MediaUploader.detect_mime("file.xyz")
  end

  def test_upload_sends_correct_content_type_for_image
    tmp_png = Tempfile.new(["test_upload", ".png"])
    tmp_png.write("fake png data")
    tmp_png.close

    response_body = { "url" => "https://orca.distark.com/media/img.png" }.to_json
    mock_response = stub(body: response_body, code: "200")
    mock_response.stubs(:is_a?).with(Net::HTTPSuccess).returns(true)

    mock_http = mock("http")
    mock_http.stubs(:use_ssl=)
    mock_http.stubs(:read_timeout=)
    mock_http.expects(:request).with do |req|
      req.body.include?("image/png") && req.body.include?("name=\"kind\"\r\n\r\nimage\r\n")
    end.returns(mock_response)

    Net::HTTP.stubs(:new).returns(mock_http)

    url = MediaUploader.upload(tmp_png.path)
    assert_equal "https://orca.distark.com/media/img.png", url
  ensure
    tmp_png.unlink if tmp_png
  end
end
