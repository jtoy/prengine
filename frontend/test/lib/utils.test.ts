import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cn, authenticatedFetch, getRecordingMimeType } from '@/lib/utils'

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

describe('getRecordingMimeType', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns webm with vp9 when supported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type: string) => type === 'video/webm;codecs=vp9',
    })

    const result = getRecordingMimeType()
    expect(result).toEqual({ mimeType: 'video/webm;codecs=vp9', extension: 'webm' })
  })

  it('returns plain webm when vp9 not supported but webm is', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type: string) => type === 'video/webm',
    })

    const result = getRecordingMimeType()
    expect(result).toEqual({ mimeType: 'video/webm', extension: 'webm' })
  })

  it('returns mp4 when only mp4 is supported (Safari)', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (type: string) => type === 'video/mp4',
    })

    const result = getRecordingMimeType()
    expect(result).toEqual({ mimeType: 'video/mp4', extension: 'mp4' })
  })

  it('returns empty mimeType when nothing is supported', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: () => false,
    })

    const result = getRecordingMimeType()
    expect(result).toEqual({ mimeType: '', extension: 'webm' })
  })

  it('returns webm fallback when MediaRecorder is undefined', () => {
    const original = globalThis.MediaRecorder
    // @ts-expect-error - intentionally removing MediaRecorder
    delete globalThis.MediaRecorder

    const result = getRecordingMimeType()
    expect(result).toEqual({ mimeType: 'video/webm', extension: 'webm' })

    // Restore
    if (original) {
      vi.stubGlobal('MediaRecorder', original)
    }
  })
})
