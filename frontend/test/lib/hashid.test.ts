import { describe, it, expect } from 'vitest'
import { generateShareHash } from '@/lib/hashid'

describe('generateShareHash', () => {
  it('returns a string of the default length (16)', () => {
    const hash = generateShareHash()
    expect(hash).toHaveLength(16)
  })

  it('returns a string of the specified length', () => {
    const hash = generateShareHash(32)
    expect(hash).toHaveLength(32)
  })

  it('returns only hex characters', () => {
    const hash = generateShareHash()
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('generates unique hashes on successive calls', () => {
    const hashes = new Set(Array.from({ length: 100 }, () => generateShareHash()))
    expect(hashes.size).toBe(100)
  })
})
