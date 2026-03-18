import type { Job, JobRun, JobLog } from './db-types'
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
  attachments: { url: string; filename: string; mime_type: string }[]
  selected_repos?: string[]
  enrich?: boolean
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

export async function uploadFiles(files: File[]): Promise<{ url: string; filename: string; mime_type: string; size: number }[]> {
  const results = []
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('bugfixvibe_token')}`,
      },
      body: formData,
    })
    if (!response.ok) throw new Error(`Failed to upload ${file.name}`)
    results.push(await response.json())
  }
  return results
}
