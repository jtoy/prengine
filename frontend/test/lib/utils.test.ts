import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cn, authenticatedFetch } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('merges tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('handles empty inputs', () => {
    expect(cn()).toBe('')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})

describe('authenticatedFetch', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('adds auth header when token exists', async () => {
    localStorage.setItem('distark_token', 'test-token-123')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await authenticatedFetch('/api/test')

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-123',
      },
    })
  })

  it('sends request without auth header when no token', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await authenticatedFetch('/api/test')

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  })

  it('passes through additional options', async () => {
    localStorage.setItem('distark_token', 'tok')
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await authenticatedFetch('/api/test', { method: 'POST', body: '{"a":1}' })

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      method: 'POST',
      body: '{"a":1}',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer tok',
      },
    })
  })

  it('allows overriding Content-Type header', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', mockFetch)

    await authenticatedFetch('/api/test', {
      headers: { 'Content-Type': 'text/plain' },
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/test', {
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  })
})
