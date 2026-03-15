require_relative "llm_client"

module ReportEnricher
  # Enrich a bug report or feature request into a structured, actionable prompt.
  # Uses the configured LLM provider (ollama, anthropic, etc.) via LLMClient.
  # Returns enriched text, or nil on failure.
  def self.enrich(title, summary)
    puts "[ReportEnricher] Enriching: #{title}"

    prompt = <<~PROMPT
      You are a software engineering assistant. A user submitted the following report.
      It may be a bug report or a feature request. Rewrite it into a clear, structured,
      actionable description that a coding agent can act on.

      TITLE: #{title}

      DESCRIPTION:
      #{summary}

      Rewrite this into the following format. Omit any section that does not apply.

      ## Summary
      (1-2 sentence clear description of the issue or request)

      ## Steps to Reproduce (if bug)
      (numbered steps, inferred from context if not explicit)

      ## Expected Behavior
      (what should happen)

      ## Actual Behavior (if bug)
      (what happens instead)

      ## Requirements (if feature)
      (bullet list of what needs to be built)

      ## Likely Affected Components
      (which parts of the codebase are probably involved — files, modules, layers)

      ## Suggested Approach
      (brief recommendation for how to fix or implement this)

      Be concise and factual. Do not add information that cannot be reasonably inferred
      from the report. If the report is already clear, keep the rewrite short.
    PROMPT

    result = LLMClient.generate(prompt)

    if result && !result.strip.empty?
      puts "[ReportEnricher] Enriched: #{result.length} chars"
      result.strip
    else
      puts "[ReportEnricher] LLM returned empty, skipping enrichment"
      nil
    end
  rescue => e
    puts "[ReportEnricher] Error: #{e.message}"
    nil
  end
end
