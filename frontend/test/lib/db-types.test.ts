import { describe, it, expect } from 'vitest'
import type { Job, JobRun, Attachment, User, JobStatus, RunStatus, DirectorsPlan, DirectorsPlanScene } from '@/lib/db-types'

describe('db-types', () => {
  it('Job type has required fields', () => {
    const job: Job = {
      id: 1,
      title: 'Test bug',
      summary: 'Something broke',
      status: 'pending',
      created_by: 1,
      created_by_email: 'user@test.com',
      pr_url: null,
      pr_urls: null,
      selected_repos: null,
      diff_summary: null,
      failure_reason: null,
      attachments: [],
      repo_url: null,
      enrich: false,
      enriched_summary: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    expect(job.id).toBe(1)
    expect(job.title).toBe('Test bug')
  })

  it('JobRun type has required fields', () => {
    const run: JobRun = {
      id: 1,
      job_id: 1,
      run_number: 1,
      status: 'pending',
      branch_name: null,
      commit_sha: null,
      pr_url: null,
      pr_urls: null,
      preview_url: null,
      logs: null,
      test_output: null,
      diff_summary: null,
      prompt: null,
      created_at: '2024-01-01T00:00:00Z',
      finished_at: null,
    }
    expect(run.run_number).toBe(1)
  })

  it('Attachment type works with optional size', () => {
    const a1: Attachment = { url: 'http://test.com/f.png', filename: 'f.png', mime_type: 'image/png' }
    const a2: Attachment = { url: 'http://test.com/f.png', filename: 'f.png', mime_type: 'image/png', size: 1024 }
    expect(a1.size).toBeUndefined()
    expect(a2.size).toBe(1024)
  })

  it('JobStatus type covers all statuses', () => {
    const statuses: JobStatus[] = ['pending', 'queued', 'processing', 'testing', 'pr_submitted', 'pr_merged', 'failed']
    expect(statuses).toHaveLength(7)
  })

  it('RunStatus type covers all statuses', () => {
    const statuses: RunStatus[] = [
      'pending', 'cloning', 'running_agent', 'running_tests',
      'pushing', 'creating_pr', 'starting_preview', 'completed', 'failed',
    ]
    expect(statuses).toHaveLength(9)
  })

  it('DirectorsPlan type has required fields', () => {
    const plan: DirectorsPlan = {
      id: 1,
      title: 'My Director Plan',
      description: 'A test plan',
      share_hash: 'abc123def456ghij',
      created_by: 1,
      created_by_email: 'user@test.com',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    expect(plan.id).toBe(1)
    expect(plan.share_hash).toBe('abc123def456ghij')
  })

  it('DirectorsPlanScene type has required fields', () => {
    const scene: DirectorsPlanScene = {
      id: 1,
      plan_id: 1,
      scene_number: 1,
      title: 'Opening shot',
      description: 'Wide angle establishing shot',
      sketch_url: 'https://example.com/sketch.png',
      notes: 'Use warm lighting',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    expect(scene.scene_number).toBe(1)
    expect(scene.sketch_url).toBe('https://example.com/sketch.png')
  })
})
