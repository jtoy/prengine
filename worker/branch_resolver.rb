# Branch resolution logic for different workflows
class BranchResolver
  def self.resolve_branches(job)
    # Use job-specific branches if provided
    if job['source_branch'] && job['target_branch']
      {
        source: job['source_branch'],
        target: job['target_branch']
      }
    else
      # Fall back to repository default
      repo_name = extract_repo_name(job)
      base_branch = DB.get_repo_branch(repo_name)
      {
        source: base_branch,
        target: base_branch
      }
    end
  end

  def self.extract_repo_name(job)
    # Extract repository name from job data
    job['repo_url'] || 
    (job['selected_repos'] && !job['selected_repos'].empty? ? 
      JSON.parse(job['selected_repos']).first : nil) ||
    'unknown'
  end

  # Different branch strategies for different scenarios
  def self.gitflow_strategy(repo_name)
    {
      feature: { source: 'develop', target: 'develop' },
      bugfix: { source: 'develop', target: 'develop' }, 
      hotfix: { source: 'main', target: 'main' },
      release: { source: 'develop', target: 'main' }
    }
  end

  def self.github_flow_strategy(repo_name) 
    base_branch = DB.get_repo_branch(repo_name)
    {
      feature: { source: base_branch, target: base_branch },
      bugfix: { source: base_branch, target: base_branch },
      hotfix: { source: base_branch, target: base_branch }
    }
  end

  # Analyze job content to suggest appropriate workflow
  def self.suggest_strategy(job_title, job_summary)
    content = "#{job_title} #{job_summary}".downcase
    
    if content.include?('critical') || content.include?('production') || content.include?('urgent')
      :hotfix
    elsif content.include?('feature') || content.include?('enhancement') || content.include?('new')
      :feature  
    else
      :bugfix
    end
  end
end