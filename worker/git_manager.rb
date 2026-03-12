require "octokit"
require "fileutils"
require_relative "config"

class GitManager
  attr_reader :repo_url, :work_path, :branch_name

  def initialize(repo_url, job_id, run_number)
    @repo_url = repo_url
    @branch_name = "bugfix/job-#{job_id}-run-#{run_number}"
    @work_path = File.join(Config::WORK_DIR, "job-#{job_id}-run-#{run_number}")
    @client = Octokit::Client.new(access_token: Config::GITHUB_TOKEN)
  end

  def clone
    FileUtils.rm_rf(@work_path) if Dir.exist?(@work_path)
    FileUtils.mkdir_p(Config::WORK_DIR)

    # Use token in clone URL for auth
    authenticated_url = @repo_url.sub("https://", "https://#{Config::GITHUB_TOKEN}@")
    system("git", "clone", "--depth", "1", authenticated_url, @work_path, exception: true)
  end

  def create_branch
    Dir.chdir(@work_path) do
      system("git", "checkout", "-b", @branch_name, exception: true)
    end
  end

  def commit(message)
    Dir.chdir(@work_path) do
      system("git", "add", "-A", exception: true)

      # Check if there are changes to commit
      status = `git status --porcelain`
      return nil if status.strip.empty?

      system("git", "commit", "-m", message, exception: true)
      sha = `git rev-parse HEAD`.strip
      sha
    end
  end

  def push
    Dir.chdir(@work_path) do
      system("git", "push", "--force", "origin", @branch_name, exception: true)
    end
  end

  def create_pr(title:, body:)
    # Extract owner/repo from URL
    match = @repo_url.match(%r{github\.com[:/](.+?)/(.+?)(?:\.git)?$})
    return nil unless match

    full_repo = "#{match[1]}/#{match[2]}"

    begin
      pr = @client.create_pull_request(full_repo, "main", @branch_name, title, body)
      pr.html_url
    rescue Octokit::UnprocessableEntity => e
      if e.message.include?("already exists")
        # Update the existing PR instead
        puts "[GitManager] PR already exists for #{@branch_name}, updating..."
        existing = @client.pull_requests(full_repo, head: "#{match[1]}:#{@branch_name}", state: "open").first
        if existing
          @client.update_pull_request(full_repo, existing.number, title: title, body: body)
          existing.html_url
        else
          raise
        end
      else
        raise
      end
    end
  end

  def diff_summary
    Dir.chdir(@work_path) do
      `git diff HEAD~1 --stat 2>/dev/null`.strip
    end
  end

  # Returns diff suitable for LLM consumption (stat + truncated patch)
  def diff_for_llm
    Dir.chdir(@work_path) do
      stat = `git diff --cached --stat 2>/dev/null`.strip
      patch = `git diff --cached 2>/dev/null`
      # If nothing staged, diff against working tree
      if stat.empty?
        stat = `git diff --stat 2>/dev/null`.strip
        patch = `git diff 2>/dev/null`
      end
      truncated = patch.lines.first(200).join
      "#{stat}\n---\n#{truncated}"
    end
  end

  def cleanup
    FileUtils.rm_rf(@work_path) if Dir.exist?(@work_path)
  end
end
