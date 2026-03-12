require_relative "db"
require_relative "redis_client"
require_relative "git_manager"
require_relative "agent_runner"
require_relative "test_runner"
require_relative "ngrok_manager"
require_relative "llm_client"
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
      "#{job['title']}\n\n#{job['summary']}"
    end

    # Determine repo URL — use job's repo_url or let agent decide from configured repos
    repo_url = job["repo_url"]
    if repo_url.nil? || repo_url.empty?
      repo_url = Config::REPOS.first
      repo_url = "https://github.com/#{repo_url}" unless repo_url&.start_with?("http")
    end

    unless repo_url
      fail_job(job_id, nil, "No repository configured")
      return
    end

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
      execute_pipeline(job_id, run_id, run["run_number"].to_i, repo_url, prompt)
    rescue => e
      puts "[JobProcessor] Error: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
      fail_job(job_id, run_id, e.message)
    end
  end

  private

  def execute_pipeline(job_id, run_id, run_number, repo_url, prompt)
    started_at = Time.now.utc
    git = GitManager.new(repo_url, job_id, run_number)

    # Step 1: Clone
    log_step(job_id, 1, "Cloning #{repo_url}")
    update_status(job_id, run_id, run_number, "processing", "cloning")
    git.clone
    log_step(job_id, 1, "Clone complete")

    # Step 2: Create branch
    git.create_branch
    log_step(job_id, 2, "Branch created: #{git.branch_name}")

    # Step 3: Run coding agent
    log_step(job_id, 3, "Running agent...")
    update_status(job_id, run_id, run_number, "processing", "running_agent")
    agent = AgentRunner.new(git.work_path)
    result = agent.run(prompt)
    log_step(job_id, 3, "Agent finished — success=#{result[:success]}, output=#{result[:output].to_s.length} chars")

    output_str = result[:output].to_s
    DB.update_run(run_id, { "logs" => output_str.length > 50_000 ? output_str[-50_000..] : output_str })

    unless result[:success]
      fail_reason = result[:output].to_s
      fail_job(job_id, run_id, "Agent failed: #{fail_reason.length > 500 ? fail_reason[-500..] : fail_reason}")
      return
    end

    # Step 4: Generate commit message and commit
    log_step(job_id, 4, "Generating commit message...")
    diff_text = git.diff_for_llm
    commit_msg = generate_commit_message(diff_text, prompt)
    log_step(job_id, 4, "Committing: #{commit_msg}")

    sha = git.commit(commit_msg)
    unless sha
      fail_job(job_id, run_id, "No changes were made by the agent")
      return
    end
    DB.update_run(run_id, { "commit_sha" => sha, "branch_name" => git.branch_name })
    log_step(job_id, 4, "Committed: #{sha}")

    # Step 5: Run tests (non-fatal — log results but continue pipeline)
    log_step(job_id, 5, "Running tests...")
    update_status(job_id, run_id, run_number, "testing", "running_tests")
    test_runner = TestRunner.new(git.work_path)
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
    log_step(job_id, 5, "Tests finished — status=#{test_status}")
    if !test_result[:success] && !test_result[:skipped]
      log_step(job_id, 5, "Test output:\n#{test_result[:output]}")
    end

    # Step 6: Push
    log_step(job_id, 6, "Pushing branch...")
    update_status(job_id, run_id, run_number, "testing", "pushing")
    git.push
    log_step(job_id, 6, "Pushed")

    # Step 7: Create PR with LLM-generated description
    log_step(job_id, 7, "Creating PR...")
    update_status(job_id, run_id, run_number, "testing", "creating_pr")

    diff = git.diff_summary
    pr_title = commit_msg.length > 72 ? commit_msg[0..71] : commit_msg
    pr_body = generate_pr_body(diff_text, prompt, test_status, job_id)
    log_step(job_id, 7, "PR title: #{pr_title}")

    pr_url = git.create_pr(title: pr_title, body: pr_body)

    duration_s = (Time.now.utc - started_at).round(1)
    DB.update_run(run_id, {
      "pr_url" => pr_url, "diff_summary" => diff,
      "status" => "completed", "finished_at" => Time.now.utc.iso8601,
      "duration_seconds" => duration_s,
    })
    DB.update_job(job_id, { "status" => "pr_submitted", "pr_url" => pr_url, "diff_summary" => diff })

    publish_update(job_id, run_id, run_number, "pr_submitted", "completed", pr_url: pr_url)

    log_step(job_id, 7, "Done! PR: #{pr_url} (#{duration_s}s)")

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

  def generate_pr_body(diff_text, prompt, test_status, job_id)
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
    body
  end

  def log_step(job_id, step, msg)
    puts "[Job ##{job_id}] Step #{step}: #{msg}"
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
