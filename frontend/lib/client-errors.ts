import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getRedis } from './redis'
import { query } from './db'

// --- Project ID: MD5 of repo name ---

export function repoNameToProjectId(repoName: string): string {
  return createHash('md5').update(repoName).digest('hex')
}

export async function lookupRepoByProjectId(projectId: string): Promise<{
  id: number
  name: string
  base_branch: string
  error_tracking_enabled: boolean
  error_autofix_enabled: boolean
} | null> {
  // We need to find the repo whose md5(name) matches projectId
  // Since md5 is deterministic, we compute it in SQL
  const result = await query(
    `SELECT id, name, base_branch, error_tracking_enabled, error_autofix_enabled
     FROM repositories
     WHERE md5(name) = $1 AND enabled = true
     LIMIT 1`,
    [projectId]
  )
  return result.rows[0] || null
}

// --- CORS ---

const ALLOWED_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)*distark\.com$/,
  /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/,
]

const DEV_PATTERN = /^http:\/\/localhost(:\d+)?$/

export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_PATTERNS.some(p => p.test(origin))) return true
  if (process.env.NODE_ENV !== 'production' && DEV_PATTERN.test(origin)) return true
  return false
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

// --- Rate Limiting ---

export async function isRateLimited(ip: string, projectId: string): Promise<boolean> {
  const redis = getRedis()
  const key = `ratelimit:ce:${ip}:${projectId}`
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, 60)
  }
  return count > 60
}

// --- Fingerprint ---

function normalizeMessage(msg: string): string {
  return msg
    .trim()
    .replace(/\s+/g, ' ')
    // strip UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    // strip hex strings >= 8 chars
    .replace(/\b[0-9a-f]{8,}\b/gi, '<hex>')
    // strip large numbers (6+ digits)
    .replace(/\b\d{6,}\b/g, '<num>')
    // strip ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<ts>')
}

export function computeFingerprint(projectId: string, type: string, message: string): string {
  const normalized = normalizeMessage(message)
  return createHash('sha256').update(`${projectId}|${type}|${normalized}`).digest('hex')
}

// --- Validation ---

export interface ErrorPayload {
  projectId: string
  type: string
  message: string
  stack?: string
  source?: string
  metadata?: Record<string, any>
}

export function validatePayload(body: any): { valid: true; payload: ErrorPayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid JSON body' }
  }
  if (!body.projectId || typeof body.projectId !== 'string') {
    return { valid: false, error: 'Missing projectId' }
  }
  if (!body.message || typeof body.message !== 'string') {
    return { valid: false, error: 'Missing message' }
  }
  if (!body.type || typeof body.type !== 'string') {
    return { valid: false, error: 'Missing type' }
  }

  // Truncate fields
  const payload: ErrorPayload = {
    projectId: body.projectId.slice(0, 100),
    type: body.type.slice(0, 100),
    message: body.message.slice(0, 2000),
    stack: typeof body.stack === 'string' ? body.stack.slice(0, 8000) : undefined,
    source: body.source === 'backend' ? 'backend' : 'client',
    metadata: undefined,
  }

  if (body.metadata && typeof body.metadata === 'object') {
    const metaStr = JSON.stringify(body.metadata).slice(0, 2000)
    try {
      payload.metadata = JSON.parse(metaStr)
    } catch {
      // truncation may break JSON; just drop it
    }
  }

  return { valid: true, payload }
}

// --- CORS middleware helper ---

export function handleCors(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin')

  // No Origin header = backend caller, skip CORS
  if (!origin) return null

  if (!isAllowedOrigin(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // For OPTIONS preflight, return immediately
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }

  return null
}

export function addCorsToResponse(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin')
  if (origin && isAllowedOrigin(origin)) {
    const headers = corsHeaders(origin)
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value)
    }
  }
  return response
}
