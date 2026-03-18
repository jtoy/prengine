require_relative "db"
require_relative "llm_client"

module RepoRouter
  # Given a bug title/summary and available repos, return which repos are relevant.
  # Uses LLM when there are >2 repos; otherwise returns all.
  def self.route(title, summary, available_repos)
    if available_repos.length <= 2
      puts "[RepoRouter] #{available_repos.length} repos configured, using all"
      return available_repos
    end

    puts "[RepoRouter] Routing across #{available_repos.length} repos via LLM..."

    descriptions = DB.get_repo_descriptions
    repo_list = available_repos.map do |repo|
      desc = descriptions[repo]
      desc ? "- #{repo}: #{desc}" : "- #{repo}"
    end.join("\n")

    prompt = <<~PROMPT
      You are a bug triage assistant. Given a bug report and a list of repositories,
      determine which repositories are most likely to need changes to fix the bug.

      REPOSITORIES:
      #{repo_list}

      BUG REPORT:
      Title: #{title}
      Description: #{summary}

      Reply with ONLY the repository names (one per line, in owner/name format) that
      need changes. Include at least one repository. If unsure, include all that seem
      relevant.

      REPOSITORIES TO CHANGE:
    PROMPT

    response = LLMClient.generate(prompt)

    if response.nil? || response.strip.empty?
      puts "[RepoRouter] LLM returned empty, falling back to all repos"
      return available_repos
    end

    selected = parse_repos(response, available_repos)

    if selected.empty?
      puts "[RepoRouter] No valid repos parsed from LLM response, falling back to all repos"
      return available_repos
    end

    puts "[RepoRouter] Selected repos: #{selected.join(', ')}"
    selected
  end

  private

  def self.parse_repos(response, available_repos)
    selected = []
    response.each_line do |line|
      line = line.strip.sub(/^[-*•]\s*/, "")
      # Match against available repos
      available_repos.each do |repo|
        if line.include?(repo) || line.include?(repo.split("/").last)
          selected << repo unless selected.include?(repo)
        end
      end
    end
    selected
  end
end
