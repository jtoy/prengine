export interface User {
  id: number
  email: string
  name: string
  role: string
  created_at: string
  updated_at: string
}

export type JobSource = 'user' | 'error_tracker'

export interface Job {
  id: number
  title: string
  summary: string | null
  mode: JobMode
  source: JobSource
  status: string
  created_by: number | null
  created_by_email: string | null
  created_by_name: string | null
  pr_url: string | null
  pr_urls: { repo: string; url: string }[] | null
  selected_repos: string[] | null
  diff_summary: string | null
  failure_reason: string | null
  note: string | null
  attachments: Attachment[]
  repo_url: string | null
  enrich: boolean
  enriched_summary: string | null
  source_branch: string | null
  target_branch: string | null
  created_at: string
  updated_at: string
}

export type JobMode = 'build' | 'review'

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

export type JobStatus = 'pending' | 'queued' | 'processing' | 'testing' | 'pr_submitted' | 'pr_merged' | 'completed' | 'failed' | 'closed'
export type RunStatus = 'pending' | 'cloning' | 'running_agent' | 'running_tests' | 'pushing' | 'creating_pr' | 'starting_preview' | 'completed' | 'failed'

export interface Repository {
  id: number
  name: string
  base_branch: string
  description: string | null
  enabled: boolean
  app_dir: string
  env_vars: Record<string, string>
  context: string
  error_tracking_enabled: boolean
  error_autofix_enabled: boolean
  project_id?: string // md5 of name, computed by admin API
  created_at: string
  updated_at: string
}

export interface ClientError {
  id: number
  fingerprint: string
  repository_id: number
  repository_name: string
  type: string
  message: string
  stack: string | null
  metadata: Record<string, any> | null
  error_source: string
  count: number
  job_id: number | null
  first_seen_at: string
  last_seen_at: string
}
