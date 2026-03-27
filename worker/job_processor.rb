require "open3"
require "fileutils"
require "timeout"
require_relative "db"
require_relative "redis_client"
require_relative "git_manager"
require_relative "multi_repo_git_manager"
require_relative "repo_router"
require_relative "agent_runner"
require_relative "test_runner"
require_relative "ngrok_manager"
require_relative "llm_client"
require_relative "report_enricher"
require_relative "video_analyzer"
require_relative "verification_generator"
require_relative "proof_recorder"
require_relative "media_uploader"
require_relative "config"

class JobProcessor
  def initialize
    @ngrok = NgrokManager.new
  end

  def process(message)
    job_id = message[:job_id]
    type = message[:type]

    puts "[JobProcessor] Processing #{type} for job ##{job_id}"

    job = DB.get_job(job_id)
    unless job
      puts "[JobProcessor] Job ##{job_id} not found!"
      return
    end

    # Determine prompt
    prompt = if type == "followup"
      message[:prompt]
    else
      raw = "#{job['title']}\n\n#{job['summary']}"
      if job["enrich"] == "t" || job["enrich"] == true
        log_step(job_id, 0, "Enriching report...")
        enriched = ReportEnricher.enrich(job["title"], job["summary"])
        if enriched
          DB.update_job(job_id, { "enriched_summary" => enriched })
          log_step(job_id, 0, "Enriched: #{enriched.length} chars")
          enriched
        else
          log_step(job_id, 0, "Enrichment failed, using raw prompt")
          raw
        end
      else
        raw
      end
    end

    # Analyze video attachments (if any)
    if type != "followup"
      attachments_raw = job["attachments"]
      attachments = if attachments_raw.is_a?(String)
        JSON.parse(attachments_raw) rescue []
      elsif attachments_raw.is_a?(Array)
        attachments_raw
      else
        []
      end

      has_media = attachments.any? do |a|
        mime = a["mime_type"] || a[:mime_type] || ""
        mime.start_with?("video/") || mime.start_with?("image/")
      end

      if has_media
        log_step(job_id, 0, "Analyzing media attachments...")
        media_analysis = VideoAnalyzer.analyze_media_attachments(attachments)
        if media_analysis
          prompt = "#{prompt}\n\n## Media Analysis (from attached video/images)\n#{media_analysis}"
          log_step(job_id, 0, "Media analysis complete: #{media_analysis.length} chars")
        end
      end
    end

    # Determine repos — multi-repo selection
    repo_names = select_repos(job, is_followup: type == "followup")

    if repo_names.empty?
      fail_job(job_id, nil, "No repository configured")
      return
    end

    puts "[JobProcessor] Selected repos: #{repo_names.join(', ')}"

    # Create or find the run
    run_number = if type == "followup"
      latest = DB.get_latest_run(job_id)
      latest ? latest["run_number"].to_i : 1
    else
      1
    end

    run_result = if type == "new_job"
      DB.create_run(job_id, 1, prompt)
    else
      # For followup, run was already created by the API
      result = DB.get_latest_run(job_id)
      result ? result : DB.create_run(job_id, run_number, prompt)
    end

    run = run_result.is_a?(PG::Result) ? run_result[0] : run_result
    run_id = run["id"].to_i

    begin
      submitter_name = job["created_by_name"] || job["created_by_email"] || "unknown"
      execute_pipeline(job_id, run_id, run["run_number"].to_i, repo_names, prompt, submitter_name)
    rescue => e
      puts "[JobProcessor] Error: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
      fail_job(job_id, run_id, e.message)
    end
  end

  private

  def select_repos(job, is_followup: false)
    # 1. If job has selected_repos, use those
    selected = parse_json_field(job["selected_repos"])
    if selected.is_a?(Array) && !selected.empty?
      puts "[JobProcessor] Using user-selected repos"
      return selected
    end

    # 2. For followups, extract repos from previous PR URLs
    if is_followup
      pr_urls = parse_json_field(job["pr_urls"])
      if pr_urls.is_a?(Array) && !pr_urls.empty?
        repos = pr_urls.map { |pr| pr["repo"] || pr[:repo] }.compact.uniq
        if repos.any?
          puts "[JobProcessor] Followup: reusing repos from previous PRs"
          return repos
        end
      end
      # Fall back to extracting from single pr_url
      pr_url = job["pr_url"]
      if pr_url && !pr_url.to_s.empty?
        match = pr_url.match(%r{github\.com/(.+?)/(.+?)/pull/})
        if match
          puts "[JobProcessor] Followup: reusing repo from previous PR"
          return ["#{match[1]}/#{match[2]}"]
        end
      end
    end

    # 3. If job has repo_url, extract owner/name
    repo_url = job["repo_url"]
    if repo_url && !repo_url.to_s.empty?
      match = repo_url.match(%r{github\.com[:/](.+?)/(.+?)(?:\.git)?$})
      if match
        return ["#{match[1]}/#{match[2]}"]
      end
      # If it's already owner/name format
      return [repo_url] if repo_url.include?("/") && !repo_url.include?("://")
    end

    # 4. If job has source_project, match it to a configured repo
    source_project = job["source_project"]
    if source_project && !source_project.to_s.empty?
      configured_repos = DB.get_enabled_repos
      match = configured_repos.find { |r| r.split("/").last == source_project }
      if match
        puts "[JobProcessor] Using source_project repo: #{match}"
        return [match]
      end
    end

    # 5. LLM-based routing from configured repos (new jobs only)
    configured_repos = DB.get_enabled_repos
    if configured_repos.any?
      RepoRouter.route(job["title"], job["summary"], configured_repos)
    else
      []
    end
  end

  def parse_json_field(value)
    return nil if value.nil?
    return value if value.is_a?(Array)
    JSON.parse(value) rescue nil
  end

  def execute_pipeline(job_id, run_id, run_number, repo_names, prompt, submitter_name)
    started_at = Time.now.utc
    git = MultiRepoGitManager.new(repo_names, job_id, run_number)
    repo_dirs = repo_names.map { |r| r.split("/").last }

    # Step 1: Setup multi-repo workspace (clone from cache + branch)
    log_step(job_id, 1, "Setting up workspace for #{repo_names.join(', ')}")
    update_status(job_id, run_id, run_number, "processing", "cloning")
    git.setup_workspace
    log_step(job_id, 1, "Workspace ready: #{git.work_path}")

    # Step 2: Run coding agent from workspace root
    log_step(job_id, 2, "Running agent...")
    update_status(job_id, run_id, run_number, "processing", "running_agent")
    session_dir = "/tmp/bugfixvibe/sessions"
    FileUtils.mkdir_p(session_dir)
    session_path = File.join(session_dir, "job-#{job_id}.jsonl")
    agent = AgentRunner.new(git.work_path, repo_dirs: repo_dirs, session_path: session_path)
    result = agent.run(prompt)
    log_step(job_id, 2, "Agent finished — success=#{result[:success]}, output=#{result[:output].to_s.length} chars")

    output_str = result[:output].to_s
    DB.update_run(run_id, { "logs" => output_str.length > 50_000 ? output_str[-50_000..] : output_str })

    # Save session content to DB for web review
    if File.exist?(session_path)
      session_content = File.read(session_path)
      DB.update_run(run_id, { "session_content" => session_content }) unless session_content.empty?
    end

    unless result[:success]
      fail_reason = result[:output].to_s
      fail_job(job_id, run_id, "Agent failed: #{fail_reason.length > 500 ? fail_reason[-500..] : fail_reason}")
      return
    end

    # Step 3: Detect changes, generate commit message, commit per repo
    log_step(job_id, 3, "Generating commit message...")
    diff_text = git.diff_for_llm
    commit_msg = generate_commit_message(diff_text, prompt)
    log_step(job_id, 3, "Committing: #{commit_msg}")

    commits = git.commit_all(commit_msg)
    if commits.empty?
      fail_job(job_id, run_id, "No changes were made by the agent")
      return
    end

    first_sha = commits.values.first
    DB.update_run(run_id, { "commit_sha" => first_sha, "branch_name" => git.branch_name })
    log_step(job_id, 3, "Committed #{commits.size} repo(s): #{commits.map { |n, s| "#{n}=#{s[0..7]}" }.join(', ')}")

    # Step 4: Run tests (in first changed repo, non-fatal)
    log_step(job_id, 4, "Running tests...")
    update_status(job_id, run_id, run_number, "testing", "running_tests")
    first_changed = commits.keys.first
    test_path = File.join(git.work_path, first_changed)
    test_runner = TestRunner.new(test_path)
    test_result = test_runner.run

    test_status = if test_result[:skipped]
      "skipped"
    elsif test_result[:command_not_found]
      "command_not_found"
    elsif test_result[:success]
      "passed"
    else
      "failed"
    end

    DB.update_run(run_id, { "test_output" => test_result[:output], "test_status" => test_status })
    log_step(job_id, 4, "Tests finished — status=#{test_status}")
    if !test_result[:success] && !test_result[:skipped]
      log_step(job_id, 4, "Test output:\n#{test_result[:output]}")

      # Analyze test failure artifacts (screenshots/videos) with LLM
      test_artifacts = test_result[:artifacts] || []
      if test_artifacts.any?
        log_step(job_id, 4, "Analyzing #{test_artifacts.length} test failure artifact(s)...")
        artifact_analysis = analyze_test_artifacts(test_artifacts)
        if artifact_analysis
          prompt = "#{prompt}\n\n## Test Failure Visual Analysis (from test screenshots/videos)\n#{artifact_analysis}"
          log_step(job_id, 4, "Artifact analysis complete: #{artifact_analysis.length} chars")
        end
      end
    end

    # Step 5: Verification proof (video + screenshots) — non-fatal
    proof_urls = { video_urls: [], screenshot_urls: [] }
    git.workspace.each_repo_dir do |dir, name|
      next unless commits.key?(name)
      next unless VerificationGenerator.web_app?(dir)

      pkg_path = VerificationGenerator.find_package_json(dir)
      next unless pkg_path

      pkg = JSON.parse(File.read(pkg_path)) rescue {}
      scripts = pkg["scripts"] || {}
      dev_cmd = scripts["dev"] ? "npm run dev" : "npm start"
      port = VerificationGenerator.extract_port(scripts) || 3000

      log_step(job_id, 5, "Recording proof for #{name}...")
      update_status(job_id, run_id, run_number, "testing", "verifying")

      result = ProofRecorder.record(
        repo_dir: dir, dev_cmd: dev_cmd, port: port,
        timeout: Config::PROOF_TIMEOUT
      )

      if result[:video_path]
        url = MediaUploader.upload(result[:video_path])
        proof_urls[:video_urls] << url if url
      end
      result[:screenshot_paths].each do |path|
        url = MediaUploader.upload(path)
        proof_urls[:screenshot_urls] << url if url
      end

      log_step(job_id, 5, "Proof done: #{result[:success] ? 'success' : 'failed'}")
    rescue => e
      log_step(job_id, 5, "Proof recording failed (non-fatal): #{e.message}")
    end

    # Step 6: Push all changed repos
    log_step(job_id, 6, "Pushing #{commits.size} repo(s)...")
    update_status(job_id, run_id, run_number, "testing", "pushing")
    git.push_all
    log_step(job_id, 6, "Pushed")

    # Step 7: Create PRs per changed repo
    log_step(job_id, 7, "Creating PRs...")
    update_status(job_id, run_id, run_number, "testing", "creating_pr")

    diff = git.diff_summary
    pr_title = commit_msg.length > 72 ? commit_msg[0..71] : commit_msg
    pr_body = generate_pr_body(diff_text, prompt, test_status, job_id, proof_urls, submitter_name, output_str)
    log_step(job_id, 7, "PR title: #{pr_title}")

    pr_results = git.create_prs(title: pr_title, body: pr_body)
    first_pr_url = pr_results.first&.dig(:url)
    pr_urls_json = pr_results.map { |r| { "repo" => r[:repo], "url" => r[:url] } }

    duration_s = (Time.now.utc - started_at).round(1)
    DB.update_run(run_id, {
      "pr_url" => first_pr_url, "pr_urls" => JSON.generate(pr_urls_json),
      "diff_summary" => diff,
      "status" => "completed", "finished_at" => Time.now.utc.iso8601,
      "duration_seconds" => duration_s,
    })
    DB.update_job(job_id, {
      "status" => "pr_submitted", "pr_url" => first_pr_url,
      "pr_urls" => JSON.generate(pr_urls_json), "diff_summary" => diff,
    })

    publish_update(job_id, run_id, run_number, "pr_submitted", "completed", pr_url: first_pr_url)

    log_step(job_id, 7, "Done! #{pr_results.size} PR(s): #{pr_results.map { |r| r[:url] }.join(', ')} (#{duration_s}s)")

    git.cleanup
  end

  def generate_commit_message(diff_text, prompt)
    llm_prompt = <<~P
      #{diff_text}

      Based on the diff above, write a single-line git commit message.

      RULES:
      - Max 12 words, imperative mood ("Add X" not "Added X")
      - Summarize the PURPOSE of the change, not the files
      - Do NOT review, praise, or comment on the code quality
      - No markdown, quotes, backticks, bullet points, or explanations
      - No trailing period

      Bug report context: #{prompt.lines.first&.strip}

      YOUR COMMIT MESSAGE:
    P

    msg = LLMClient.generate(llm_prompt)
    if msg
      # Clean: take first non-empty line, strip quotes/backticks
      msg = msg.lines.reject { |l| l.strip.empty? }.first&.strip || msg.strip
      msg = msg.gsub(/\A[`"']|[`"']\z/, "")
      msg = msg[0..99] # cap at 100 chars
    end
    msg = "fix: #{prompt.lines.first&.strip&.slice(0, 72)}" if msg.nil? || msg.empty?
    msg
  end

  def generate_pr_body(diff_text, prompt, test_status, job_id, proof_urls = {}, submitter_name = nil, agent_output = nil)
    llm_prompt = <<~P
      You are writing a GitHub pull request description.

      BUG REPORT:
      #{prompt}

      DIFF:
      #{diff_text}

      TEST STATUS: #{test_status}

      Write a concise PR description in markdown with these sections:
      ## Summary
      (2-3 sentences about what was changed and why)

      ## Changes
      (bullet list of specific changes made)

      ## Test Results
      (one line about test status: #{test_status})

      Keep it concise and factual. No praise or filler.
    P

    body = LLMClient.generate(llm_prompt)
    if body.nil? || body.empty?
      body = "Auto-generated fix for job ##{job_id}\n\n**Bug report:** #{prompt}\n\n**Test status:** #{test_status}"
    end

    # Append raw agent output
    if agent_output && !agent_output.empty?
      trimmed = agent_output.length > 10_000 ? agent_output[-10_000..] : agent_output
      body += "\n\n<details>\n<summary>Agent Output</summary>\n\n```\n#{trimmed}\n```\n\n</details>"
    end

    # Append verification video/screenshots if any
    if proof_urls[:video_urls]&.any?
      body += "\n\n## Verification\n"
      proof_urls[:video_urls].each do |url|
        body += "[Watch verification video](#{url})\n\n"
      end
    end
    if proof_urls[:screenshot_urls]&.any?
      body += "\n\n## Verification Screenshots\n" unless proof_urls[:video_urls]&.any?
      proof_urls[:screenshot_urls].each_with_index do |url, i|
        body += "![screenshot-#{i + 1}](#{url})\n"
      end
    end

    # Append submitter info
    if submitter_name && !submitter_name.empty?
      body += "\n\n**Submitted by:** #{submitter_name}"
    end

    # Append original bug report for reviewer context
    body += "\n\n<details>\n<summary>Original Bug Report</summary>\n\n#{prompt}\n\n</details>"
    body
  end

  def analyze_test_artifacts(artifacts)
    return nil if artifacts.empty?

    # Convert local file paths to attachment format for VideoAnalyzer
    # For local files, we use file:// URIs
    media_artifacts = artifacts.select do |a|
      mime = a[:mime_type] || ""
      VideoAnalyzer.media_mime?(mime)
    end

    return nil if media_artifacts.empty?

    results = media_artifacts.filter_map do |artifact|
      analyze_local_artifact(artifact)
    end

    return nil if results.empty?
    results.join("\n\n---\n\n")
  rescue => e
    puts "[JobProcessor] Error analyzing test artifacts: #{e.message}"
    nil
  end

  def analyze_local_artifact(artifact)
    return nil if Config::GEMINI_API_KEY.to_s.empty?

    path = artifact[:path]
    filename = artifact[:filename]
    mime_type = artifact[:mime_type]

    return nil unless path && File.exist?(path)

    puts "[JobProcessor] Analyzing local artifact: #{filename} (#{mime_type})"

    # For videos, convert if needed
    upload_path = path
    upload_mime = mime_type
    if mime_type&.include?("webm")
      upload_path, upload_mime = VideoAnalyzer.send(:convert_to_mp4, path, mime_type)
    end

    # Upload to Gemini
    file_info = VideoAnalyzer.send(:upload_to_gemini, upload_path, upload_mime, filename)
    return nil unless file_info

    file_name = file_info["name"]
    file_uri = file_info["uri"]

    # Wait for processing
    unless VideoAnalyzer.send(:wait_for_processing, file_name)
      puts "[JobProcessor] Artifact processing timed out: #{filename}"
      return nil
    end

    # Choose prompt based on media type
    prompt = if VideoAnalyzer.image_mime?(mime_type)
      VideoAnalyzer::IMAGE_ANALYSIS_PROMPT
    else
      VideoAnalyzer::VIDEO_ANALYSIS_PROMPT
    end

    analysis = VideoAnalyzer.send(:analyze_with_gemini, file_uri, upload_mime, prompt)
    puts "[JobProcessor] Artifact analysis complete: #{filename} (#{analysis&.length || 0} chars)"
    analysis
  rescue => e
    puts "[JobProcessor] Error analyzing artifact #{filename}: #{e.message}"
    nil
  ensure
    VideoAnalyzer.send(:delete_from_gemini, file_name) if file_name
    if upload_path && upload_path != path && File.exist?(upload_path)
      File.delete(upload_path) rescue nil
    end
  end

  def log_step(job_id, step, msg)
    puts "[Job ##{job_id}] Step #{step}: #{msg}"
    DB.insert_log(job_id, "info", "JobProcessor", "Step #{step}: #{msg}")
  end

  def update_status(job_id, run_id, run_number, job_status, run_status)
    DB.update_job(job_id, { "status" => job_status })
    DB.update_run(run_id, { "status" => run_status })
    publish_update(job_id, run_id, run_number, job_status, run_status)
  end

  def fail_job(job_id, run_id, reason)
    DB.update_job(job_id, { "status" => "failed", "failure_reason" => reason })
    if run_id
      DB.update_run(run_id, { "status" => "failed", "finished_at" => Time.now.utc.iso8601 })
    end
    publish_update(job_id, run_id, nil, "failed", "failed")
    puts "[JobProcessor] Job ##{job_id} failed: #{reason}"
    DB.insert_log(job_id, "error", "JobProcessor", "Job failed: #{reason}")
  end

  def publish_update(job_id, run_id, run_number, job_status, run_status, pr_url: nil, preview_url: nil)
    RedisQueue.publish_status(job_id, {
      job_id: job_id,
      job_status: job_status,
      run_id: run_id,
      run_status: run_status,
      run_number: run_number,
      pr_url: pr_url,
      preview_url: preview_url,
      updated_at: Time.now.utc.iso8601,
    })
  end
end
