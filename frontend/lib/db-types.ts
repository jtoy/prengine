export interface User {
  id: number
  email: string
  name: string
  role: string
  created_at: string
  updated_at: string
}

export interface Job {
  id: number
  title: string
  summary: string | null
  status: string
  created_by: number | null
  created_by_email: string | null
  created_by_name: string | null
  pr_url: string | null
  pr_urls: { repo: string; url: string }[] | null
  selected_repos: string[] | null
  diff_summary: string | null
  failure_reason: string | null
  attachments: Attachment[]
  repo_url: string | null
  enrich: boolean
  enriched_summary: string | null
  created_at: string
  updated_at: string
}

export interface JobRun {
  id: number
  job_id: number
  run_number: number
  status: string
  branch_name: string | null
  commit_sha: string | null
  pr_url: string | null
  pr_urls: { repo: string; url: string }[] | null
  preview_url: string | null
  logs: string | null
  test_output: string | null
  diff_summary: string | null
  prompt: string | null
  session_content: string | null
  created_at: string
  finished_at: string | null
}

export interface Attachment {
  url: string
  filename: string
  mime_type: string
  size?: number
}

export interface JobLog {
  id: number
  job_id: number | null
  level: string
  source: string
  message: string
  created_at: string
}

export type JobStatus = 'pending' | 'queued' | 'processing' | 'testing' | 'pr_submitted' | 'pr_merged' | 'failed'
export type RunStatus = 'pending' | 'cloning' | 'running_agent' | 'running_tests' | 'pushing' | 'creating_pr' | 'starting_preview' | 'completed' | 'failed'
