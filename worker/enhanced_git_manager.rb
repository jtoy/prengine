# Enhanced Git Manager with flexible branch strategies
# Can replace MultiRepoGitManager or be used alongside it

require_relative "multi_repo_git_manager"
require_relative "branch_resolver"

class EnhancedGitManager < MultiRepoGitManager
  def initialize(repo_names, job_id, run_number, job_context = nil)
    @repo_names = repo_names
    @job_id = job_id
    @run_number = run_number
    @job_context = job_context
    
    # Resolve branch strategy based on job context
    if @job_context
      branches = BranchResolver.resolve_branches(@job_context)
      @source_branch = branches[:source]
      @target_branch = branches[:target]
    else
      # Fallback to default behavior
      @source_branch = DB.get_repo_branch(repo_names.first)
      @target_branch = @source_branch
    end
    
    @branch_name = "bugfix/job-#{job_id}"
    @workspace = WorkspaceManager.new(repo_names, job_id, run_number)
    @client = Octokit::Client.new(access_token: Config::GITHUB_TOKEN)
    @changed_repos = []
    
    puts "[EnhancedGitManager] Branch strategy: #{@source_branch} → #{@target_branch}"
  end

  # Override setup to use resolved source branch
  def setup_workspace
    @workspace.setup
    if @source_branch != DB.get_repo_branch(@repo_names.first)
      puts "[EnhancedGitManager] Creating branches from custom source: #{@source_branch}"
      @workspace.create_branches_from(@branch_name, @source_branch)
    else
      puts "[EnhancedGitManager] Using standard branch creation"
      @workspace.create_branches(@branch_name)
    end
  end

  # Override PR creation to use resolved target branch  
  private

  def create_or_update_pr(full_repo, title, body)
    owner, _repo = full_repo.split("/")

    begin
      pr = @client.create_pull_request(full_repo, @target_branch, @branch_name, title, body)
      puts "[EnhancedGitManager] PR created for #{full_repo}: #{@branch_name} → #{@target_branch} (#{pr.html_url})"
      pr.html_url
    rescue Octokit::UnprocessableEntity => e
      if e.message.include?("already exists")
        puts "[EnhancedGitManager] PR already exists for #{full_repo}, updating..."
        existing = @client.pull_requests(full_repo, head: "#{owner}:#{@branch_name}", state: "open").first
        if existing
          @client.update_pull_request(full_repo, existing.number, title: title, body: body)
          existing.html_url
        else
          puts "[EnhancedGitManager] Could not find existing PR for #{full_repo}"
          nil
        end
      else
        puts "[EnhancedGitManager] PR creation failed for #{full_repo}: #{e.message}"
        nil
      end
    end
  end
end