require_relative "llm_client"
require_relative "db"
require "json"

class QAGenerator

  def generate_qa_checklist(job_id, git_diff, test_output, git_manager, process_log = "")
    puts "[QAGenerator] Generating QA checklist for job ##{job_id}"
    
    # Gather all available context
    context = gather_context(job_id, git_diff, test_output, git_manager, process_log)
    
    unless context
      puts "[QAGenerator] Could not gather context for job ##{job_id}"
      return generate_fallback_checklist_simple(job_id, git_diff)
    end
    
    # Generate QA analysis using LLM
    qa_analysis = generate_analysis(context)
    
    # Format as markdown for PR description
    format_pr_section(qa_analysis, context)
  rescue => e
    puts "[QAGenerator] Error generating QA checklist: #{e.message}"
    generate_fallback_checklist(context)
  end

  private

  def gather_context(job_id, git_diff, test_output, git_manager, process_log)
    job = DB.get_job(job_id)
    return nil unless job
    
    # Try to get repository name from different possible fields
    repo_name = job['repo_url'] || 
                (job['selected_repos'] && !job['selected_repos'].empty? ? 
                  JSON.parse(job['selected_repos']).first : nil) ||
                'unknown'
    
    # Extract repo name from URL if it's a full URL
    if repo_name.include?('github.com')
      repo_name = repo_name.split('github.com/').last.sub('.git', '').sub(/\/$/, '')
    end
    
    # Get repository context from DB
    repo_context = get_repository_context(repo_name)
    
    # Get list of changed files for component analysis
    changed_files = extract_changed_files(git_diff)
    
    # Get source code snippets for key files if needed
    source_snippets = get_relevant_source_code(changed_files, git_manager)
    
    {
      job_details: {
        id: job_id,
        title: job['title'],
        summary: job['summary'],
        enriched_summary: job['enriched_summary'],
        source_project: job['source_project'],
        repository: repo_name
      },
      repository_context: repo_context,
      code_changes: {
        diff: git_diff,
        changed_files: changed_files,
        source_snippets: source_snippets
      },
      process_info: {
        test_output: test_output,
        process_log: process_log
      }
    }
  end

  def get_repository_context(repo_name)
    result = DB.query(
      "SELECT context, description, app_dir FROM repositories WHERE name = $1", 
      [repo_name]
    )
    
    if result.ntuples > 0
      row = result[0]
      context_text = row['context'].to_s.strip
      
      # If context is a URL, note it (could fetch it in future)
      if context_text.start_with?('http')
        {
          type: 'url',
          content: context_text,
          description: row['description'],
          app_dir: row['app_dir']
        }
      else
        {
          type: 'text',
          content: context_text,
          description: row['description'],
          app_dir: row['app_dir']
        }
      end
    else
      { type: 'none', content: '', description: '', app_dir: '' }
    end
  end

  def extract_changed_files(git_diff)
    # Extract file paths from git diff
    files = []
    git_diff.each_line do |line|
      if line.start_with?('diff --git')
        # Extract file path: diff --git a/path/file.rb b/path/file.rb
        file_path = line.split(' ')[2].sub('a/', '')
        files << file_path
      end
    end
    files
  end

  def get_relevant_source_code(changed_files, git_manager)
    snippets = {}
    
    # Get source code for critical files that were changed
    critical_patterns = [
      /job_processor/,
      /worker/,
      /api.*route/,
      /auth/,
      /db/,
      /config/
    ]
    
    changed_files.each do |file|
      if critical_patterns.any? { |pattern| file.match?(pattern) }
        begin
          # Read file content from git working directory
          full_path = File.join(git_manager.instance_variable_get(:@workspace_dir), file)
          if File.exist?(full_path)
            content = File.read(full_path)
            # Truncate very long files
            snippets[file] = content.length > 3000 ? "#{content[0..2000]}...[truncated]" : content
          end
        rescue => e
          puts "[QAGenerator] Could not read #{file}: #{e.message}"
        end
      end
    end
    
    snippets
  end

  def generate_analysis(context)
    prompt = build_analysis_prompt(context)
    
    response = LLMClient.generate(prompt)
    
    # Parse LLM response into structured analysis
    parse_analysis_response(response)
  end

  def build_analysis_prompt(context)
    repo_context_section = if context[:repository_context][:type] == 'url'
      "Repository context available at: #{context[:repository_context][:content]}"
    elsif !context[:repository_context][:content].empty?
      "Repository context:\n#{context[:repository_context][:content]}"
    else
      "No specific repository context provided."
    end

    source_code_section = if context[:code_changes][:source_snippets].any?
      snippets_text = context[:code_changes][:source_snippets].map do |file, content|
        "=== #{file} ===\n#{content}\n"
      end.join("\n")
      "KEY SOURCE CODE:\n#{snippets_text}"
    else
      "Source code not analyzed."
    end

    <<~PROMPT
      You are a QA expert analyzing a code change for a bug-fixing system called Prengine.

      SYSTEM OVERVIEW:
      Prengine is an automated bug-fixing system with these components:
      - Frontend (Next.js): Bug report submission interface
      - Worker (Ruby): AI-powered bug fixing backend
      - Widget (JavaScript): Embeddable bug reporting
      - Database (PostgreSQL): Job and repository management  
      - Redis: Job queue and communication

      #{repo_context_section}

      ORIGINAL BUG REPORT:
      Title: #{context[:job_details][:title]}
      Summary: #{context[:job_details][:summary]}
      #{context[:job_details][:enriched_summary] ? "Enriched: #{context[:job_details][:enriched_summary]}" : ""}
      Source Project: #{context[:job_details][:source_project]}
      Repository: #{context[:job_details][:repository]}

      FILES CHANGED:
      #{context[:code_changes][:changed_files].join(", ")}

      CODE CHANGES (DIFF):
      #{context[:code_changes][:diff]}

      #{source_code_section}

      TEST RESULTS:
      #{context[:process_info][:test_output]}

      PROCESS LOG:
      #{context[:process_info][:process_log]}

      Analyze this change and provide:

      1. RISK_LEVEL: LOW/MEDIUM/HIGH/CRITICAL
      2. AFFECTED_COMPONENTS: List of system components impacted
      3. POTENTIAL_IMPACTS: What could break or be affected
      4. MANUAL_QA_CHECKLIST: Specific test steps a human should perform

      Focus on:
      - Critical user workflows that could be broken
      - Integration points between components
      - Edge cases the AI might have missed
      - Security implications
      - Performance impacts

      Format your response as JSON:
      {
        "risk_level": "...",
        "affected_components": ["..."],
        "potential_impacts": ["..."],
        "qa_checklist": {
          "functional": ["..."],
          "integration": ["..."],
          "security": ["..."],
          "performance": ["..."]
        },
        "summary": "Brief summary of the change and why these tests are needed"
      }
    PROMPT
  end

  def parse_analysis_response(response)
    begin
      # Try to extract JSON from the response
      json_match = response.match(/\{.*\}/m)
      if json_match
        JSON.parse(json_match[0])
      else
        raise "No JSON found in response"
      end
    rescue => e
      puts "[QAGenerator] Failed to parse LLM response: #{e.message}"
      # Return basic fallback structure
      {
        "risk_level" => "MEDIUM",
        "affected_components" => ["Unknown"],
        "potential_impacts" => ["Manual verification required"],
        "qa_checklist" => {
          "functional" => ["Verify the original bug is fixed"],
          "integration" => ["Test end-to-end workflow"]
        },
        "summary" => "QA analysis failed - manual review recommended"
      }
    end
  end

  def format_pr_section(analysis, context)
    checklist_items = []
    
    analysis["qa_checklist"]&.each do |category, items|
      next if items.nil? || items.empty?
      checklist_items << "**#{category.capitalize} Testing:**"
      items.each { |item| checklist_items << "- [ ] #{item}" }
      checklist_items << ""
    end

    <<~MARKDOWN

      ## 🤖 QA Analysis

      **Risk Level:** #{analysis['risk_level']}  
      **Components:** #{analysis['affected_components']&.join(', ')}

      #{analysis['summary']}

      ### ⚠️ Potential Impacts
      #{analysis['potential_impacts']&.map { |impact| "- #{impact}" }&.join("\n")}

      ### ✅ Manual QA Checklist
      #{checklist_items.join("\n")}

      <details>
      <summary>🔍 Technical Details</summary>

      **Original Bug:** #{context[:job_details][:title]}  
      **Repository:** #{context[:job_details][:repository]}  
      **Files Changed:** #{context[:code_changes][:changed_files].join(', ')}

      </details>

      ---
      *QA analysis generated automatically*
    MARKDOWN
  end

  def generate_fallback_checklist(context)
    # Simple fallback when LLM analysis fails
    <<~MARKDOWN

      ## 🤖 QA Analysis (Fallback)

      **Risk Level:** MEDIUM (Analysis failed - manual review required)

      ### ✅ Basic QA Checklist
      - [ ] Verify the original bug described in "#{context[:job_details][:title]}" is fixed
      - [ ] Test the main user workflow end-to-end
      - [ ] Confirm no regressions in related functionality
      - [ ] Verify all tests pass

      **Files Changed:** #{context[:code_changes][:changed_files].join(', ')}

      ---
      *QA analysis generated automatically (fallback mode)*
    MARKDOWN
  end

  def generate_fallback_checklist_simple(job_id, git_diff)
    changed_files = extract_changed_files(git_diff)
    
    <<~MARKDOWN

      ## 🤖 QA Analysis (Simplified)

      **Risk Level:** MEDIUM (Context unavailable - manual review required)

      ### ✅ Basic QA Checklist
      - [ ] Verify the bug fix works as expected
      - [ ] Test the main user workflow end-to-end  
      - [ ] Confirm no regressions in related functionality
      - [ ] Verify all tests pass

      **Files Changed:** #{changed_files.join(', ')}

      ---
      *QA analysis generated automatically (simplified mode)*
    MARKDOWN
  end
end