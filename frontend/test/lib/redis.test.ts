import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ioredis before importing the module
vi.mock('ioredis', () => {
  const mockRedis = {
    lpush: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn(),
    on: vi.fn(),
  }
  return { default: vi.fn(() => mockRedis) }
})

import { getRedis, pushJob, publishStatus, subscribeToJob } from '@/lib/redis'
import Redis from 'ioredis'

describe('redis module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getRedis', () => {
    it('returns a Redis instance', () => {
      const redis = getRedis()
      expect(redis).toBeDefined()
    })

    it('returns the same instance on subsequent calls', () => {
      const r1 = getRedis()
      const r2 = getRedis()
      expect(r1).toBe(r2)
    })
  })

  describe('pushJob', () => {
    it('pushes job to the queue', async () => {
      await pushJob({
        type: 'new_job',
        job_id: 1,
        title: 'Bug fix',
        summary: 'Fix the thing',
        attachments: [],
        created_by: 42,
      })

      const redis = getRedis()
      expect(redis.lpush).toHaveBeenCalledWith(
        'bugfixvibe:jobs',
        expect.any(String)
      )

      const payload = JSON.parse((redis.lpush as any).mock.calls[0][1])
      expect(payload.type).toBe('new_job')
      expect(payload.job_id).toBe(1)
      expect(payload.created_by).toBe(42)
    })

    it('pushes followup job', async () => {
      await pushJob({
        type: 'followup',
        job_id: 5,
        prompt: 'Try again',
        created_by: 10,
      })

      const redis = getRedis()
      const payload = JSON.parse((redis.lpush as any).mock.calls[0][1])
      expect(payload.type).toBe('followup')
      expect(payload.prompt).toBe('Try again')
    })
  })

  describe('publishStatus', () => {
    it('publishes status to correct channel', async () => {
      await publishStatus(42, { status: 'processing', step: 2 })

      const redis = getRedis()
      expect(redis.publish).toHaveBeenCalledWith(
        'bugfixvibe:status:42',
        JSON.stringify({ status: 'processing', step: 2 })
      )
    })
  })

  describe('subscribeToJob', () => {
    it('creates subscriber on correct channel', () => {
      const onMessage = vi.fn()
      const sub = subscribeToJob(7, onMessage)

      expect(sub).toBeDefined()
      expect(sub.subscribe).toHaveBeenCalledWith('bugfixvibe:status:7')
      expect(sub.on).toHaveBeenCalledWith('message', expect.any(Function))
    })
  })
})
