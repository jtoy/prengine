import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var _redisClient: Redis | undefined
}

export function getRedis(): Redis {
  if (!global._redisClient) {
    global._redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
  }
  return global._redisClient
}

export async function pushJob(payload: {
  type: 'new_job' | 'followup'
  job_id: number
  title?: string
  summary?: string
  attachments?: { url: string; filename: string; mime_type: string }[]
  prompt?: string
  created_by: number
}) {
  const r = getRedis()
  await r.lpush('bugfixvibe:jobs', JSON.stringify(payload))
}

export async function publishStatus(jobId: number, status: Record<string, any>) {
  const r = getRedis()
  await r.publish(`bugfixvibe:status:${jobId}`, JSON.stringify(status))
}

export function subscribeToJob(jobId: number, onMessage: (data: any) => void): Redis {
  const sub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
  const channel = `bugfixvibe:status:${jobId}`

  sub.subscribe(channel)
  sub.on('message', (_ch: string, message: string) => {
    try {
      onMessage(JSON.parse(message))
    } catch (e) {
      console.error('Failed to parse status message:', e)
    }
  })

  return sub
}
