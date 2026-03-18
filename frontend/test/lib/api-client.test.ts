import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchJobs, fetchJob, createJob, fetchRepos, fetchJobRuns, submitFollowup, uploadFiles, fetchLogs } from '@/lib/api-client'

// Mock the utils module
vi.mock('@/lib/utils', () => ({
  authenticatedFetch: vi.fn(),
  cn: vi.fn(),
}))

import { authenticatedFetch } from '@/lib/utils'

const mockAuthFetch = vi.mocked(authenticatedFetch)

describe('api-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('fetchJobs', () => {
    it('fetches and returns jobs array', async () => {
      const jobs = [{ id: 1, title: 'Bug 1' }, { id: 2, title: 'Bug 2' }]
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(jobs),
      } as Response)

      const result = await fetchJobs()
      expect(result).toEqual(jobs)
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/jobs')
    })

    it('throws on non-ok response', async () => {
      mockAuthFetch.mockResolvedValue({ ok: false } as Response)
      await expect(fetchJobs()).rejects.toThrow('Failed to fetch jobs')
    })
  })

  describe('fetchJob', () => {
    it('fetches a single job by id', async () => {
      const job = { id: 42, title: 'Bug 42' }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(job),
      } as Response)

      const result = await fetchJob(42)
      expect(result).toEqual(job)
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/jobs/42')
    })

    it('throws on not found', async () => {
      mockAuthFetch.mockResolvedValue({ ok: false } as Response)
      await expect(fetchJob(999)).rejects.toThrow('Failed to fetch job')
    })
  })

  describe('createJob', () => {
    it('creates a job with all fields', async () => {
      const job = { id: 1, title: 'New bug', status: 'queued' }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(job),
      } as Response)

      const result = await createJob({
        title: 'New bug',
        summary: 'Something broke',
        attachments: [{ url: 'http://f.co/a.png', filename: 'a.png', mime_type: 'image/png' }],
        selected_repos: ['owner/repo'],
        enrich: true,
      })

      expect(result).toEqual(job)
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New bug',
          summary: 'Something broke',
          attachments: [{ url: 'http://f.co/a.png', filename: 'a.png', mime_type: 'image/png' }],
          selected_repos: ['owner/repo'],
          enrich: true,
        }),
      })
    })

    it('throws on failure', async () => {
      mockAuthFetch.mockResolvedValue({ ok: false } as Response)
      await expect(createJob({ title: 'x', summary: '', attachments: [] })).rejects.toThrow('Failed to create job')
    })
  })

  describe('fetchRepos', () => {
    it('fetches repos list (no auth required)', async () => {
      const repos = ['owner/repo1', 'owner/repo2']
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(repos),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await fetchRepos()
      expect(result).toEqual(repos)
      expect(mockFetch).toHaveBeenCalledWith('/api/repos')
    })

    it('throws on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      await expect(fetchRepos()).rejects.toThrow('Failed to fetch repos')
    })
  })

  describe('fetchJobRuns', () => {
    it('fetches runs for a job', async () => {
      const runs = [{ id: 1, run_number: 1, status: 'completed' }]
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(runs),
      } as Response)

      const result = await fetchJobRuns(5)
      expect(result).toEqual(runs)
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/jobs/5/runs')
    })
  })

  describe('submitFollowup', () => {
    it('submits a followup prompt', async () => {
      const run = { id: 2, run_number: 2, status: 'pending' }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(run),
      } as Response)

      const result = await submitFollowup(5, 'Try a different approach')
      expect(result).toEqual(run)
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/jobs/5/followup', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'Try a different approach' }),
      })
    })

    it('throws on failure', async () => {
      mockAuthFetch.mockResolvedValue({ ok: false } as Response)
      await expect(submitFollowup(1, 'x')).rejects.toThrow('Failed to submit follow-up')
    })
  })

  describe('fetchLogs', () => {
    it('fetches logs with no filters', async () => {
      const data = { logs: [{ id: 1, message: 'test' }], has_more: false }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      } as Response)

      const result = await fetchLogs()
      expect(result).toEqual(data)
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/admin/logs')
    })

    it('fetches logs with job_id filter', async () => {
      const data = { logs: [], has_more: false }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      } as Response)

      await fetchLogs({ job_id: 42 })
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/admin/logs?job_id=42')
    })

    it('fetches logs with level filter', async () => {
      const data = { logs: [], has_more: false }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      } as Response)

      await fetchLogs({ level: 'error' })
      expect(mockAuthFetch).toHaveBeenCalledWith('/api/admin/logs?level=error')
    })

    it('fetches logs with combined filters', async () => {
      const data = { logs: [], has_more: false }
      mockAuthFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      } as Response)

      await fetchLogs({ job_id: 5, level: 'info', since: '2024-01-01T00:00:00Z', limit: 50 })
      expect(mockAuthFetch).toHaveBeenCalledWith(
        '/api/admin/logs?job_id=5&level=info&since=2024-01-01T00%3A00%3A00Z&limit=50'
      )
    })

    it('throws on failure', async () => {
      mockAuthFetch.mockResolvedValue({ ok: false } as Response)
      await expect(fetchLogs()).rejects.toThrow('Failed to fetch logs')
    })
  })

  describe('uploadFiles', () => {
    it('uploads files sequentially and returns results', async () => {
      localStorage.setItem('bugfixvibe_token', 'tok')
      const file1 = new File(['content1'], 'file1.png', { type: 'image/png' })
      const file2 = new File(['content2'], 'file2.jpg', { type: 'image/jpeg' })

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ url: 'http://u1', filename: 'file1.png', mime_type: 'image/png', size: 8 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ url: 'http://u2', filename: 'file2.jpg', mime_type: 'image/jpeg', size: 8 }),
        })
      vi.stubGlobal('fetch', mockFetch)

      const results = await uploadFiles([file1, file2])
      expect(results).toHaveLength(2)
      expect(results[0].url).toBe('http://u1')
      expect(results[1].url).toBe('http://u2')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws if any upload fails', async () => {
      localStorage.setItem('bugfixvibe_token', 'tok')
      const file = new File(['x'], 'bad.png', { type: 'image/png' })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      await expect(uploadFiles([file])).rejects.toThrow('Failed to upload bad.png')
    })
  })
})
