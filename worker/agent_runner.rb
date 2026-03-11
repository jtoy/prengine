require "json"
require "open3"

class AgentRunner
  def initialize(work_path)
    @work_path = work_path
  end

  # Run the pi coding agent with the given prompt
  # Returns { success: bool, output: string }
  def run(prompt)
    full_prompt = build_prompt(prompt)

    stdout, stderr, status = Open3.capture3(
      "pi", "--prompt", full_prompt,
      chdir: @work_path
    )

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
