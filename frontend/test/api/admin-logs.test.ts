import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the route
vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({
  getUserFromRequest: vi.fn(),
}))

import { query } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth-server'

const mockQuery = vi.mocked(query)
const mockGetUser = vi.mocked(getUserFromRequest)

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/admin/logs')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url.toString(), {
    headers: { Authorization: 'Bearer test-token' },
  })
}

describe('GET /api/admin/logs', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const { GET } = await import('@/app/api/admin/logs/route')
    const response = await GET(makeRequest() as any)
    expect(response.status).toBe(401)
  })

  it('returns logs with no filters', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Admin' })
    const logs = [{ id: 1, message: 'test' }]
    mockQuery.mockResolvedValue({ rows: logs, rowCount: 1 } as any)

    const { GET } = await import('@/app/api/admin/logs/route')
    const response = await GET(makeRequest() as any)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.logs).toEqual(logs)
    expect(data.has_more).toBe(false)
  })

  it('filters by job_id', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Admin' })
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any)

    const { GET } = await import('@/app/api/admin/logs/route')
    await GET(makeRequest({ job_id: '42' }) as any)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('job_id = $1'),
      expect.arrayContaining([42])
    )
  })

  it('filters by level', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Admin' })
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any)

    const { GET } = await import('@/app/api/admin/logs/route')
    await GET(makeRequest({ level: 'error' }) as any)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('level = $1'),
      expect.arrayContaining(['error'])
    )
  })

  it('filters by since', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Admin' })
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any)

    const { GET } = await import('@/app/api/admin/logs/route')
    await GET(makeRequest({ since: '2024-01-01T00:00:00Z' }) as any)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('created_at > $1'),
      expect.arrayContaining(['2024-01-01T00:00:00Z'])
    )
  })

  it('combines multiple filters', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Admin' })
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any)

    const { GET } = await import('@/app/api/admin/logs/route')
    await GET(makeRequest({ job_id: '5', level: 'info', since: '2024-01-01T00:00:00Z' }) as any)

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('job_id = $1'),
      expect.arrayContaining([5, 'info', '2024-01-01T00:00:00Z'])
    )
  })

  it('detects has_more when more rows than limit', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Admin' })
    // Return 4 rows when limit is 3 → has_more = true
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    mockQuery.mockResolvedValue({ rows, rowCount: 4 } as any)

    const { GET } = await import('@/app/api/admin/logs/route')
    const response = await GET(makeRequest({ limit: '3' }) as any)
    const data = await response.json()

    expect(data.has_more).toBe(true)
    expect(data.logs).toHaveLength(3)
  })

  it('returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Admin' })
    mockQuery.mockRejectedValue(new Error('DB error'))

    const { GET } = await import('@/app/api/admin/logs/route')
    const response = await GET(makeRequest() as any)
    expect(response.status).toBe(500)
  })
})
