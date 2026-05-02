require "json"
require "open3"
require "shellwords"
require_relative "config"

class AgentRunner
  AGENT_CMD = ENV.fetch("AGENT_CMD", "pi")

  # work_path: directory to run agent from
  # repo_dirs: optional array of repo short names (for multi-repo prompt)
  # repo_names: optional array of full repo names (owner/name)
  # session_path: optional path to JSONL session file for pi persistence
  def initialize(work_path, repo_dirs: nil, repo_names: nil, session_path: nil, repo_contexts: nil)
    @work_path = work_path
    @repo_dirs = repo_dirs
    @repo_names = repo_names
    @session_path = session_path
    @repo_contexts = repo_contexts
  end

  # Run the coding agent with the given prompt (non-interactive)
  # Returns { success: bool, output: string }
  def run(prompt)
    full_prompt = build_prompt(prompt)

    puts "[AgentRunner] Working dir: #{@work_path}"
    puts "[AgentRunner] Session: #{@session_path || '(none)'}"
    puts "[AgentRunner] Prompt length: #{full_prompt.length} chars"
    puts "[AgentRunner] Running: #{AGENT_CMD} -p ..."

    # Use bash -lc to load the full login shell environment (asdf, etc.)
    # Pass through API keys and relevant env vars explicitly
    session_flag = @session_path ? " --session #{@session_path.shellescape}" : ""
    shell_cmd = "cd #{@work_path.shellescape} && #{AGENT_CMD}#{session_flag} -p #{full_prompt.shellescape}"

    env = {}
    env["ANTHROPIC_API_KEY"] = ENV["ANTHROPIC_API_KEY"] if ENV["ANTHROPIC_API_KEY"]
    env["LIVE_TEST_DB"] = ENV["LIVE_TEST_DB"] if distark_repo? && ENV["LIVE_TEST_DB"]

    stdout, stderr, status = Open3.capture3(
      env, "bash", "-lc", shell_cmd
    )

    puts "[AgentRunner] Exit code: #{status.exitstatus}"
    puts "[AgentRunner] Stdout: #{stdout.length} chars"
    puts "[AgentRunner] Stderr: #{stderr.length} chars"
    if stderr.length > 0
      puts "[AgentRunner] Stderr preview: #{stderr[[-500, -stderr.length].max..]}"
    end

    {
      success: status.success?,
      output: stdout + stderr,
    }
  end

  private

  def build_prompt(user_prompt)
    workspace_hint = if @repo_dirs && @repo_dirs.length > 1
      <<~HINT
        The workspace contains these repositories as subdirectories: #{@repo_dirs.join(', ')}.
        Navigate into the appropriate repo(s) to make changes. You may need to modify files
        in multiple repos if the fix spans across them.
      HINT
    elsif @repo_dirs && @repo_dirs.length == 1
      <<~HINT
        The workspace contains the repository: #{@repo_dirs.first}.
        Navigate into that directory to make changes.
      HINT
    else
      ""
    end

    context_hint = if @repo_contexts&.any?
      sections = @repo_contexts.map { |name, ctx| ctx }.join("\n\n")
      "#{sections}\n\n"
    else
      ""
    end

    db_hint = if distark_repo?
      <<~HINT
        If you need Distark application data while working, the `LIVE_TEST_DB` environment variable is available
        and points to the daily copied Distark database. You can use it for direct database inspection when useful.
      HINT
    else
      ""
    end

    <<~PROMPT
      You are fixing a bug in a codebase. Here is the bug report:

      #{user_prompt}

      #{workspace_hint}#{context_hint}#{db_hint}Fix the bug by modifying the necessary files. Make minimal, focused changes.
      If applicable, add unit and e2e tests red/green TDD style.
      Run any existing tests to verify your fix works.
    PROMPT
  end

  def distark_repo?
    Array(@repo_names).include?("distark/orchestrator") || Array(@repo_dirs).include?("orchestrator")
  end
end
