require_relative "test_helper"
require_relative "../report_enricher"

class ReportEnricherTest < Minitest::Test
  def test_enrich_returns_llm_response
    LLMClient.expects(:generate).returns("## Summary\nThe button is broken\n\n## Steps to Reproduce\n1. Click the button")

    result = ReportEnricher.enrich("Button broken", "The submit button doesn't work")
    assert_includes result, "Summary"
    assert_includes result, "button"
  end

  def test_enrich_returns_nil_when_llm_returns_nil
    LLMClient.expects(:generate).returns(nil)

    result = ReportEnricher.enrich("Bug", "Something wrong")
    assert_nil result
  end

  def test_enrich_returns_nil_when_llm_returns_empty
    LLMClient.expects(:generate).returns("  ")

    result = ReportEnricher.enrich("Bug", "Something wrong")
    assert_nil result
  end

  def test_enrich_returns_nil_on_error
    LLMClient.expects(:generate).raises(RuntimeError, "API error")

    result = ReportEnricher.enrich("Bug", "Description")
    assert_nil result
  end

  def test_enrich_strips_whitespace
    LLMClient.expects(:generate).returns("  \n  Enriched content here  \n  ")

    result = ReportEnricher.enrich("Title", "Desc")
    assert_equal "Enriched content here", result
  end

  def test_enrich_passes_title_and_summary_to_prompt
    LLMClient.expects(:generate).with { |prompt|
      prompt.include?("My Bug Title") && prompt.include?("My detailed description")
    }.returns("Enriched")

    ReportEnricher.enrich("My Bug Title", "My detailed description")
  end
end
