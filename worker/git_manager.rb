require "octokit"
require "fileutils"
require "shellwords"
require "open3"
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
    _out, err, status = Open3.capture3("git", "clone", "--depth", "1", authenticated_url, @work_path)
    raise "git clone failed: #{err}" unless status.success?
  end

  def create_branch
    _out, err, status = Open3.capture3("git", "-C", @work_path, "checkout", "-b", @branch_name)
    raise "git checkout failed: #{err}" unless status.success?
  end

  def commit(message)
    _out, err, st = Open3.capture3("git", "-C", @work_path, "add", "-A")
    raise "git add failed: #{err}" unless st.success?

    # Check if there are changes to commit
    status = `git -C #{@work_path.shellescape} status --porcelain`
    return nil if status.strip.empty?

    _out, err, st = Open3.capture3("git", "-C", @work_path, "commit", "-m", message)
    raise "git commit failed: #{err}" unless st.success?
    `git -C #{@work_path.shellescape} rev-parse HEAD`.strip
  end

  def push
    _out, err, status = Open3.capture3("git", "-C", @work_path, "push", "--force", "origin", @branch_name)
    raise "git push failed: #{err}" unless status.success?
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
    `git -C #{@work_path.shellescape} diff HEAD~1 --stat 2>/dev/null`.strip
  end

  # Returns diff suitable for LLM consumption (stat + truncated patch)
  def diff_for_llm
    esc = @work_path.shellescape
    stat = `git -C #{esc} diff --cached --stat 2>/dev/null`.strip
    patch = `git -C #{esc} diff --cached 2>/dev/null`
    # If nothing staged, diff against working tree
    if stat.empty?
      stat = `git -C #{esc} diff --stat 2>/dev/null`.strip
      patch = `git -C #{esc} diff 2>/dev/null`
    end
    truncated = patch.lines.first(200).join
    "#{stat}\n---\n#{truncated}"
  end

  def cleanup
    FileUtils.rm_rf(@work_path) if Dir.exist?(@work_path)
  end
end
