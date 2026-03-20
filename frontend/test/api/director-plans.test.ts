import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth-server', () => ({
  getUserFromRequest: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}))

vi.mock('@/lib/hashid', () => ({
  generateShareHash: vi.fn(() => 'abc123def456ghij'),
}))

import { getUserFromRequest } from '@/lib/auth-server'
import { query } from '@/lib/db'

const mockGetUser = vi.mocked(getUserFromRequest)
const mockQuery = vi.mocked(query)

describe('POST /api/director/plans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const { POST } = await import('@/app/api/director/plans/route')
    const req = new NextRequest('http://localhost/api/director/plans', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test Plan', scenes: [{ title: 'Scene 1' }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when title is missing', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'u@t.com', name: 'U', role: 'user' })
    const { POST } = await import('@/app/api/director/plans/route')
    const req = new NextRequest('http://localhost/api/director/plans', {
      method: 'POST',
      body: JSON.stringify({ scenes: [{ title: 'S1' }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Title is required')
  })

  it('returns 400 when scenes are empty', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'u@t.com', name: 'U', role: 'user' })
    const { POST } = await import('@/app/api/director/plans/route')
    const req = new NextRequest('http://localhost/api/director/plans', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test', scenes: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('At least one scene is required')
  })

  it('creates plan with scenes and returns 201 with share_hash', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'u@t.com', name: 'U', role: 'user' })
    const planRow = {
      id: 10, title: 'My Plan', description: 'desc',
      share_hash: 'abc123def456ghij', created_by: 1,
      created_by_email: 'u@t.com', created_at: '2026-01-01', updated_at: '2026-01-01',
    }
    const sceneRow = {
      id: 1, plan_id: 10, scene_number: 1, title: 'Scene 1',
      description: 'desc', sketch_url: 'https://ex.com/s.png', notes: null,
      created_at: '2026-01-01', updated_at: '2026-01-01',
    }
    mockQuery
      .mockResolvedValueOnce({ rows: [planRow], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any)
      .mockResolvedValueOnce({ rows: [sceneRow], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as any)

    const { POST } = await import('@/app/api/director/plans/route')
    const req = new NextRequest('http://localhost/api/director/plans', {
      method: 'POST',
      body: JSON.stringify({
        title: 'My Plan', description: 'desc',
        scenes: [{ title: 'Scene 1', description: 'desc', sketch_url: 'https://ex.com/s.png' }],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.share_hash).toBe('abc123def456ghij')
    expect(data.scenes).toHaveLength(1)
    expect(data.scenes[0].title).toBe('Scene 1')
  })
})

describe('GET /api/director/plans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const { GET } = await import('@/app/api/director/plans/route')
    const req = new NextRequest('http://localhost/api/director/plans')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns plans for authenticated user', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'u@t.com', name: 'U', role: 'user' })
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, title: 'Plan A', share_hash: 'h1' }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    } as any)
    const { GET } = await import('@/app/api/director/plans/route')
    const req = new NextRequest('http://localhost/api/director/plans', {
      headers: { Authorization: 'Bearer tok' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].title).toBe('Plan A')
  })
})

describe('GET /api/director/plans/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const { GET } = await import('@/app/api/director/plans/[id]/route')
    const req = new NextRequest('http://localhost/api/director/plans/1')
    const res = await GET(req, { params: { id: '1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when plan not found', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'u@t.com', name: 'U', role: 'user' })
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
    const { GET } = await import('@/app/api/director/plans/[id]/route')
    const req = new NextRequest('http://localhost/api/director/plans/999')
    const res = await GET(req, { params: { id: '999' } })
    expect(res.status).toBe(404)
  })

  it('returns plan with scenes', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'u@t.com', name: 'U', role: 'user' })
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 5, title: 'Plan', share_hash: 'h5', created_by: 1 }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 1, scene_number: 1, title: 'S1' }, { id: 2, scene_number: 2, title: 'S2' }], rowCount: 2 } as any)
    const { GET } = await import('@/app/api/director/plans/[id]/route')
    const req = new NextRequest('http://localhost/api/director/plans/5')
    const res = await GET(req, { params: { id: '5' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('Plan')
    expect(data.scenes).toHaveLength(2)
  })
})

describe('GET /api/director/plans/share/[hash] (public)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns plan with scenes for valid hash — no auth required', async () => {
    const planRow = { id: 5, title: 'Shared Plan', description: 'D', share_hash: 'validhash1234567', created_at: '2026-01-01' }
    const sceneRows = [
      { id: 1, scene_number: 1, title: 'Scene A', description: 'DA', sketch_url: 'https://ex.com/a.png', notes: null },
      { id: 2, scene_number: 2, title: 'Scene B', description: 'DB', sketch_url: 'https://ex.com/b.png', notes: 'note' },
    ]
    mockQuery
      .mockResolvedValueOnce({ rows: [planRow], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: sceneRows, rowCount: 2 } as any)

    const { GET } = await import('@/app/api/director/plans/share/[hash]/route')
    const req = new NextRequest('http://localhost/api/director/plans/share/validhash1234567')
    const res = await GET(req, { params: { hash: 'validhash1234567' } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('Shared Plan')
    expect(data.scenes).toHaveLength(2)
    expect(data.scenes[0].sketch_url).toBe('https://ex.com/a.png')
  })

  it('returns 404 for invalid hash', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
    const { GET } = await import('@/app/api/director/plans/share/[hash]/route')
    const req = new NextRequest('http://localhost/api/director/plans/share/badhash')
    const res = await GET(req, { params: { hash: 'badhash' } })
    expect(res.status).toBe(404)
  })

  it('does not expose created_by or email in public response', async () => {
    const planRow = { id: 5, title: 'P', description: null, share_hash: 'somehash12345678', created_at: '2026-01-01' }
    mockQuery
      .mockResolvedValueOnce({ rows: [planRow], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)

    const { GET } = await import('@/app/api/director/plans/share/[hash]/route')
    const req = new NextRequest('http://localhost/api/director/plans/share/somehash12345678')
    const res = await GET(req, { params: { hash: 'somehash12345678' } })
    const data = await res.json()
    expect(data.created_by).toBeUndefined()
    expect(data.created_by_email).toBeUndefined()
  })
})
