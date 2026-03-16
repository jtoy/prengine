import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getUserFromRequest, getUserIdFromRequest } from '@/lib/auth-server'

describe('auth-server', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('getUserFromRequest', () => {
    it('returns null when no Authorization header', async () => {
      const req = new NextRequest('http://localhost/api/test')
      const user = await getUserFromRequest(req)
      expect(user).toBeNull()
    })

    it('returns null when Authorization header is not Bearer', async () => {
      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Basic abc123' },
      })
      const user = await getUserFromRequest(req)
      expect(user).toBeNull()
    })

    it('returns user data on valid token', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
        }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer valid-token' },
      })

      const user = await getUserFromRequest(req)
      expect(user).toEqual({
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
      })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://orca.distark.com/api/v1/me.json',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token',
          }),
        })
      )
    })

    it('returns null when Orca returns non-ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      })
      const user = await getUserFromRequest(req)
      expect(user).toBeNull()
    })

    it('falls back to email prefix when name is missing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 2, email: 'alice@example.com', name: null }),
      }))

      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer tok' },
      })
      const user = await getUserFromRequest(req)
      expect(user?.name).toBe('alice')
    })

    it('returns null on fetch error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer tok' },
      })
      const user = await getUserFromRequest(req)
      expect(user).toBeNull()
    })
  })

  describe('getUserIdFromRequest', () => {
    it('returns user id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42, email: 'a@b.com', name: 'A' }),
      }))

      const req = new NextRequest('http://localhost/api/test', {
        headers: { Authorization: 'Bearer tok' },
      })
      const userId = await getUserIdFromRequest(req)
      expect(userId).toBe(42)
    })

    it('returns null when unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/test')
      const userId = await getUserIdFromRequest(req)
      expect(userId).toBeNull()
    })
  })
})
