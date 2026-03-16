import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GET /api/repos', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.resetModules()
  })

  it('returns parsed repos from REPOS env var', async () => {
    process.env.REPOS = 'owner/repo1, owner/repo2, owner/repo3'
    const { GET } = await import('@/app/api/repos/route')
    const response = await GET()
    const data = await response.json()
    expect(data).toEqual(['owner/repo1', 'owner/repo2', 'owner/repo3'])
  })

  it('returns empty array when REPOS is not set', async () => {
    delete process.env.REPOS
    const { GET } = await import('@/app/api/repos/route')
    const response = await GET()
    const data = await response.json()
    expect(data).toEqual([])
  })

  it('returns empty array for empty string REPOS', async () => {
    process.env.REPOS = ''
    const { GET } = await import('@/app/api/repos/route')
    const response = await GET()
    const data = await response.json()
    expect(data).toEqual([])
  })

  it('trims whitespace from repo names', async () => {
    process.env.REPOS = '  owner/repo1 ,  owner/repo2 '
    const { GET } = await import('@/app/api/repos/route')
    const response = await GET()
    const data = await response.json()
    expect(data).toEqual(['owner/repo1', 'owner/repo2'])
  })

  it('filters out empty entries from trailing commas', async () => {
    process.env.REPOS = 'owner/repo1,,owner/repo2,'
    const { GET } = await import('@/app/api/repos/route')
    const response = await GET()
    const data = await response.json()
    expect(data).toEqual(['owner/repo1', 'owner/repo2'])
  })
})
