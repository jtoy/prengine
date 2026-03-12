require "json"
require "open3"
require "shellwords"
require_relative "config"

class AgentRunner
  AGENT_CMD = ENV.fetch("AGENT_CMD", "pi")

  def initialize(work_path)
    @work_path = work_path
  end

  # Run the coding agent with the given prompt (non-interactive)
  # Returns { success: bool, output: string }
  def run(prompt)
    full_prompt = build_prompt(prompt)

    puts "[AgentRunner] Working dir: #{@work_path}"
    puts "[AgentRunner] Prompt length: #{full_prompt.length} chars"
    puts "[AgentRunner] Running: #{AGENT_CMD} -p ..."

    # Use bash -lc to load the full login shell environment (asdf, etc.)
    # Pass through API keys and relevant env vars explicitly
    shell_cmd = "cd #{@work_path.shellescape} && #{AGENT_CMD} -p #{full_prompt.shellescape}"

    env = {}
    env["ANTHROPIC_API_KEY"] = ENV["ANTHROPIC_API_KEY"] if ENV["ANTHROPIC_API_KEY"]

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
    <<~PROMPT
      You are fixing a bug in a codebase. Here is the bug report:

      #{user_prompt}

      Fix the bug by modifying the necessary files. Make minimal, focused changes.
      Run any existing tests to verify your fix works.
    PROMPT
  end
end
