import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadFile } from '@/lib/upload'

describe('uploadFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads file and returns attachment with dl URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: { url: 'https://tmpfiles.org/12345/screenshot.png' },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const file = new File(['img data'], 'screenshot.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 1024 })

    const result = await uploadFile(file)

    expect(result).toEqual({
      url: 'https://tmpfiles.org/dl/12345/screenshot.png',
      filename: 'screenshot.png',
      mime_type: 'image/png',
      size: 1024,
    })
  })

  it('converts tmpfiles URL to dl URL correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: { url: 'https://tmpfiles.org/99999/video.webm' },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const file = new File(['vid'], 'video.webm', { type: 'video/webm' })
    const result = await uploadFile(file)
    expect(result.url).toBe('https://tmpfiles.org/dl/99999/video.webm')
  })

  it('throws on upload failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
    }))

    const file = new File(['x'], 'fail.png', { type: 'image/png' })
    await expect(uploadFile(file)).rejects.toThrow('Upload failed: Bad Request')
  })

  it('sends FormData with file', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'success',
        data: { url: 'https://tmpfiles.org/1/f.png' },
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const file = new File(['x'], 'test.png', { type: 'image/png' })
    await uploadFile(file)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://tmpfiles.org/api/v1/upload')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
  })
})
