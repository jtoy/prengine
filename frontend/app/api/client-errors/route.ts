import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { pushJob } from '@/lib/redis'
import {
  validatePayload,
  computeFingerprint,
  lookupRepoByProjectId,
  isRateLimited,
  handleCors,
  addCorsToResponse,
} from '@/lib/client-errors'

export async function OPTIONS(request: NextRequest) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: NextRequest) {
  // CORS check
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  // Size check (20KB)
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 20_000) {
    return addCorsToResponse(request, NextResponse.json({ error: 'Payload too large' }, { status: 400 }))
  }

  // Parse body — handle both application/json and text/plain (sendBeacon fallback)
  let body: any
  try {
    const text = await request.text()
    if (text.length > 20_000) {
      return addCorsToResponse(request, NextResponse.json({ error: 'Payload too large' }, { status: 400 }))
    }
    body = JSON.parse(text)
  } catch {
    return addCorsToResponse(request, NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }))
  }

  // Validate
  const validation = validatePayload(body)
  if (!validation.valid) {
    return addCorsToResponse(request, NextResponse.json({ error: validation.error }, { status: 400 }))
  }
  const { payload } = validation

  // Look up repo
  const repo = await lookupRepoByProjectId(payload.projectId)
  if (!repo) {
    return addCorsToResponse(request, NextResponse.json({ error: 'Invalid project' }, { status: 400 }))
  }

  if (!repo.error_tracking_enabled) {
    return addCorsToResponse(request, NextResponse.json({ error: 'Error tracking disabled' }, { status: 403 }))
  }

  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (await isRateLimited(ip, payload.projectId)) {
    return addCorsToResponse(request, NextResponse.json({ error: 'Too many requests' }, { status: 429 }))
  }

  // Fingerprint + upsert
  const fingerprint = computeFingerprint(payload.projectId, payload.type, payload.message)

  const upsertResult = await query(
    `INSERT INTO client_errors
       (fingerprint, repository_id, type, message, stack, metadata, error_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (fingerprint) DO UPDATE SET
       count = client_errors.count + 1,
       last_seen_at = NOW(),
       stack = CASE
         WHEN length(EXCLUDED.stack) > length(COALESCE(client_errors.stack, ''))
         THEN EXCLUDED.stack
         ELSE client_errors.stack
       END
     RETURNING id, (xmax = 0) AS is_new, job_id`,
    [
      fingerprint,
      repo.id,
      payload.type,
      payload.message,
      payload.stack || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.source || 'client',
    ]
  )

  const row = upsertResult.rows[0]
  const isNew = row.is_new

  // Auto-create job for new errors if enabled
  if (isNew && repo.error_autofix_enabled) {
    try {
      // Check flood cap: max 10 open error-tracker jobs per repo
      const openJobsResult = await query(
        `SELECT COUNT(*) as cnt FROM jobs
         WHERE source = 'error_tracker'
           AND source_project = $1
           AND status NOT IN ('completed', 'failed', 'closed', 'pr_merged')`,
        [repo.name]
      )
      const openCount = parseInt(openJobsResult.rows[0].cnt, 10)

      if (openCount < 10) {
        const title = `[Auto] ${payload.type}: ${payload.message}`.slice(0, 200)
        const summaryParts = [
          `**Type:** ${payload.type}`,
          `**Source:** ${payload.source || 'client'}`,
          `**Message:** ${payload.message}`,
        ]
        if (payload.stack) summaryParts.push(`**Stack:**\n\`\`\`\n${payload.stack}\n\`\`\``)
        if (payload.metadata) summaryParts.push(`**Metadata:** ${JSON.stringify(payload.metadata)}`)
        const summary = summaryParts.join('\n\n')

        const jobResult = await query(
          `INSERT INTO jobs (title, summary, mode, selected_repos, source, source_project, created_by_name, status)
           VALUES ($1, $2, 'build', $3, 'error_tracker', $4, 'error-tracker', 'queued')
           RETURNING *`,
          [title, summary, JSON.stringify([repo.name]), repo.name]
        )

        const job = jobResult.rows[0]

        // Link the error to the job
        await query(
          `UPDATE client_errors SET job_id = $1 WHERE id = $2`,
          [job.id, row.id]
        )

        // Push to Redis queue
        await pushJob({
          type: 'new_job',
          job_id: job.id,
          title: job.title,
          summary: job.summary,
          created_by: 0, // system
        })
      }
    } catch (err) {
      // Don't fail the error ingestion if job creation fails
      console.error('Failed to auto-create job from client error:', err)
    }
  }

  return addCorsToResponse(request, new NextResponse(null, { status: 204 }))
}
