require_relative "test_helper"
require_relative "../llm_client"

class LLMClientTest < Minitest::Test
  def test_generate_dispatches_to_ollama
    # Config sets LLM_PROVIDER to "ollama" in test
    LLMClient.expects(:ollama_generate).with("test prompt", system: nil).returns("response text")

    result = LLMClient.generate("test prompt")
    assert_equal "response text", result
  end

  def test_generate_passes_system_prompt
    LLMClient.expects(:ollama_generate).with("prompt", system: "You are helpful").returns("ok")

    result = LLMClient.generate("prompt", system: "You are helpful")
    assert_equal "ok", result
  end

  def test_generate_returns_nil_on_error
    LLMClient.expects(:ollama_generate).raises(RuntimeError, "connection refused")

    result = LLMClient.generate("prompt")
    assert_nil result
  end

  def test_generate_returns_nil_for_unknown_provider
    # Temporarily change provider
    original = LLMClient::PROVIDER
    LLMClient.send(:remove_const, :PROVIDER)
    LLMClient.const_set(:PROVIDER, "unknown")

    result = LLMClient.generate("prompt")
    assert_nil result
  ensure
    LLMClient.send(:remove_const, :PROVIDER)
    LLMClient.const_set(:PROVIDER, original)
  end
end
