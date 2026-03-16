import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth-server', () => ({
  getUserFromRequest: vi.fn(),
}))

import { getUserFromRequest } from '@/lib/auth-server'
import { GET } from '@/app/api/me/route'

const mockGetUser = vi.mocked(getUserFromRequest)

describe('GET /api/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user data when authenticated', async () => {
    mockGetUser.mockResolvedValue({ id: 1, email: 'test@test.com', name: 'Test' })

    const req = new NextRequest('http://localhost/api/me', {
      headers: { Authorization: 'Bearer tok' },
    })
    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual({ id: 1, email: 'test@test.com', name: 'Test' })
  })

  it('returns 401 when no user', async () => {
    mockGetUser.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/me')
    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('returns 500 on unexpected error', async () => {
    mockGetUser.mockRejectedValue(new Error('DB down'))

    const req = new NextRequest('http://localhost/api/me')
    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
  })
})
