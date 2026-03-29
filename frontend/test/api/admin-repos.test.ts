import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const adminUser = { id: 1, email: 'admin@test.com', name: 'Admin', roles: ['admin'] }
const normalUser = { id: 2, email: 'user@test.com', name: 'User', roles: ['user'] }

function makeRequest(method: string, body?: any) {
  const url = 'http://localhost:3000/api/admin/repos'
  const init: RequestInit = {
    method,
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
  }
  if (body) init.body = JSON.stringify(body)
  return new Request(url, init)
}

describe('/api/admin/repos', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('GET', () => {
    it('returns all repos for admin user', async () => {
      mockGetUser.mockResolvedValue(adminUser)
      const repos = [
        { id: 1, name: 'org/repo1', base_branch: 'main', enabled: true, env_vars: {} },
        { id: 2, name: 'org/repo2', base_branch: 'develop', enabled: false, env_vars: {} },
      ]
      mockQuery.mockResolvedValue({ rows: repos, rowCount: 2 } as any)

      const { GET } = await import('@/app/api/admin/repos/route')
      const response = await GET(makeRequest('GET') as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual(repos)
    })

    it('returns 401 for unauthenticated', async () => {
      mockGetUser.mockResolvedValue(null)

      const { GET } = await import('@/app/api/admin/repos/route')
      const response = await GET(makeRequest('GET') as any)

      expect(response.status).toBe(401)
    })

    it('returns 403 for non-admin', async () => {
      mockGetUser.mockResolvedValue(normalUser)

      const { GET } = await import('@/app/api/admin/repos/route')
      const response = await GET(makeRequest('GET') as any)

      expect(response.status).toBe(403)
    })
  })

  describe('POST', () => {
    it('creates repo with valid data', async () => {
      mockGetUser.mockResolvedValue(adminUser)
      const created = { id: 1, name: 'org/new-repo', base_branch: 'main', enabled: true, env_vars: {} }
      mockQuery.mockResolvedValue({ rows: [created], rowCount: 1 } as any)

      const { POST } = await import('@/app/api/admin/repos/route')
      const response = await POST(makeRequest('POST', { name: 'org/new-repo' }) as any)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.name).toBe('org/new-repo')
    })

    it('returns 400 for missing name', async () => {
      mockGetUser.mockResolvedValue(adminUser)

      const { POST } = await import('@/app/api/admin/repos/route')
      const response = await POST(makeRequest('POST', {}) as any)

      expect(response.status).toBe(400)
    })

    it('returns 400 for empty name', async () => {
      mockGetUser.mockResolvedValue(adminUser)

      const { POST } = await import('@/app/api/admin/repos/route')
      const response = await POST(makeRequest('POST', { name: '  ' }) as any)

      expect(response.status).toBe(400)
    })
  })

  describe('PATCH', () => {
    it('updates repo fields', async () => {
      mockGetUser.mockResolvedValue(adminUser)
      const updated = { id: 1, name: 'org/repo', base_branch: 'develop', enabled: true, env_vars: {} }
      mockQuery.mockResolvedValue({ rows: [updated], rowCount: 1 } as any)

      const { PATCH } = await import('@/app/api/admin/repos/route')
      const response = await PATCH(makeRequest('PATCH', { id: 1, base_branch: 'develop' }) as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.base_branch).toBe('develop')
    })

    it('returns 404 for non-existent ID', async () => {
      mockGetUser.mockResolvedValue(adminUser)
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any)

      const { PATCH } = await import('@/app/api/admin/repos/route')
      const response = await PATCH(makeRequest('PATCH', { id: 999, name: 'updated' }) as any)

      expect(response.status).toBe(404)
    })

    it('returns 400 when no fields provided', async () => {
      mockGetUser.mockResolvedValue(adminUser)

      const { PATCH } = await import('@/app/api/admin/repos/route')
      const response = await PATCH(makeRequest('PATCH', { id: 1 }) as any)

      expect(response.status).toBe(400)
    })
  })

  describe('DELETE', () => {
    it('removes repo', async () => {
      mockGetUser.mockResolvedValue(adminUser)
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 } as any)

      const { DELETE } = await import('@/app/api/admin/repos/route')
      const response = await DELETE(makeRequest('DELETE', { id: 1 }) as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('returns 404 for non-existent ID', async () => {
      mockGetUser.mockResolvedValue(adminUser)
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any)

      const { DELETE } = await import('@/app/api/admin/repos/route')
      const response = await DELETE(makeRequest('DELETE', { id: 999 }) as any)

      expect(response.status).toBe(404)
    })
  })
})
