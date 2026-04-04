import type { Job, JobRun, JobLog, Repository } from './db-types'
import { authenticatedFetch } from './utils'

const API_BASE = '/api'

export async function fetchJobs(): Promise<Job[]> {
  const response = await authenticatedFetch(`${API_BASE}/jobs`)
  if (!response.ok) throw new Error('Failed to fetch jobs')
  return response.json()
}

export async function fetchJob(id: number): Promise<Job> {
  const response = await authenticatedFetch(`${API_BASE}/jobs/${id}`)
  if (!response.ok) throw new Error('Failed to fetch job')
  return response.json()
}

export async function createJob(data: {
  title: string
  summary: string
  mode?: 'build' | 'review'
  attachments: { url: string; filename: string; mime_type: string }[]
  selected_repos?: string[]
  enrich?: boolean
  source_branch?: string
  target_branch?: string
}): Promise<Job> {
  const response = await authenticatedFetch(`${API_BASE}/jobs`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to create job')
  return response.json()
}

export async function fetchRepos(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/repos`)
  if (!response.ok) throw new Error('Failed to fetch repos')
  return response.json()
}

export async function fetchJobRuns(jobId: number): Promise<JobRun[]> {
  const response = await authenticatedFetch(`${API_BASE}/jobs/${jobId}/runs`)
  if (!response.ok) throw new Error('Failed to fetch job runs')
  return response.json()
}

export async function submitFollowup(jobId: number, prompt: string): Promise<JobRun> {
  const response = await authenticatedFetch(`${API_BASE}/jobs/${jobId}/followup`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
  if (!response.ok) throw new Error('Failed to submit follow-up')
  return response.json()
}

export async function closePRs(jobId: number): Promise<Job> {
  const response = await authenticatedFetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'close_prs' }),
  })
  if (!response.ok) throw new Error('Failed to close PRs')
  return response.json()
}

export async function mergePRs(jobId: number): Promise<Job> {
  const response = await authenticatedFetch(`${API_BASE}/jobs/${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'merge_prs' }),
  })
  if (!response.ok) throw new Error('Failed to merge PRs')
  return response.json()
}

export async function fetchLogs(params?: {
  job_id?: number
  level?: string
  since?: string
  limit?: number
}): Promise<{ logs: JobLog[]; has_more: boolean }> {
  const searchParams = new URLSearchParams()
  if (params?.job_id) searchParams.set('job_id', String(params.job_id))
  if (params?.level) searchParams.set('level', params.level)
  if (params?.since) searchParams.set('since', params.since)
  if (params?.limit) searchParams.set('limit', String(params.limit))

  const qs = searchParams.toString()
  const url = `${API_BASE}/admin/logs${qs ? `?${qs}` : ''}`
  const response = await authenticatedFetch(url)
  if (!response.ok) throw new Error('Failed to fetch logs')
  return response.json()
}

export async function fetchAdminRepos(): Promise<Repository[]> {
  const response = await authenticatedFetch(`${API_BASE}/admin/repos`)
  if (!response.ok) throw new Error('Failed to fetch repositories')
  return response.json()
}

export async function createRepo(data: {
  name: string
  base_branch?: string
  description?: string
  enabled?: boolean
  app_dir?: string
  env_vars?: Record<string, string>
}): Promise<Repository> {
  const response = await authenticatedFetch(`${API_BASE}/admin/repos`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create repository')
  }
  return response.json()
}

export async function updateRepo(id: number, data: Partial<Omit<Repository, 'id' | 'created_at' | 'updated_at'>>): Promise<Repository> {
  const response = await authenticatedFetch(`${API_BASE}/admin/repos`, {
    method: 'PATCH',
    body: JSON.stringify({ id, ...data }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update repository')
  }
  return response.json()
}

export async function deleteRepo(id: number): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE}/admin/repos`, {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to delete repository')
  }
}

export async function uploadFiles(files: File[]): Promise<{ url: string; filename: string; mime_type: string; size: number }[]> {
  const results = []
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('distark_token')}`,
      },
      body: formData,
    })
    if (!response.ok) throw new Error(`Failed to upload ${file.name}`)
    results.push(await response.json())
  }
  return results
}
