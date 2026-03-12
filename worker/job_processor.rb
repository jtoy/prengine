require_relative "db"
require_relative "redis_client"
require_relative "git_manager"
require_relative "agent_runner"
require_relative "test_runner"
require_relative "ngrok_manager"
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
    git = GitManager.new(repo_url, job_id, run_number)

    # Step 1: Clone
    update_status(job_id, run_id, run_number, "processing", "cloning")
    git.clone

    # Step 2: Create branch
    git.create_branch

    # Step 3: Run coding agent
    update_status(job_id, run_id, run_number, "processing", "running_agent")
    agent = AgentRunner.new(git.work_path)
    result = agent.run(prompt)

    DB.update_run(run_id, { "logs" => result[:output].to_s.last(50_000) })

    unless result[:success]
      fail_job(job_id, run_id, "Agent failed: #{result[:output].to_s.last(500)}")
      return
    end

    # Step 4: Commit changes
    sha = git.commit("fix: #{prompt.lines.first&.strip&.slice(0, 72)}")
    unless sha
      fail_job(job_id, run_id, "No changes were made by the agent")
      return
    end
    DB.update_run(run_id, { "commit_sha" => sha, "branch_name" => git.branch_name })

    # Step 5: Run tests
    update_status(job_id, run_id, run_number, "testing", "running_tests")
    test_runner = TestRunner.new(git.work_path)
    test_result = test_runner.run
    DB.update_run(run_id, { "test_output" => test_result[:output] })

    unless test_result[:success]
      fail_job(job_id, run_id, "Tests failed")
      return
    end

    # Step 6: Push
    update_status(job_id, run_id, run_number, "testing", "pushing")
    git.push

    # Step 7: Create PR
    update_status(job_id, run_id, run_number, "testing", "creating_pr")
    pr_url = git.create_pr(
      title: "fix: #{prompt.lines.first&.strip&.slice(0, 72)}",
      body: "Auto-generated fix for job ##{job_id}\n\n#{prompt}"
    )

    diff = git.diff_summary
    DB.update_run(run_id, { "pr_url" => pr_url, "diff_summary" => diff, "status" => "completed", "finished_at" => Time.now.utc.iso8601 })
    DB.update_job(job_id, { "status" => "pr_submitted", "pr_url" => pr_url, "diff_summary" => diff })

    publish_update(job_id, run_id, run_number, "pr_submitted", "completed", pr_url: pr_url)

    # Step 8: Start preview (optional)
    # update_status(job_id, run_id, run_number, "pr_submitted", "starting_preview")
    # preview_url = @ngrok.start(3000, label: "job-#{job_id}")
    # DB.update_run(run_id, { "preview_url" => preview_url }) if preview_url

    puts "[JobProcessor] Job ##{job_id} completed. PR: #{pr_url}"

    git.cleanup
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
