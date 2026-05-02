import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getUserFromRequest } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const repo = searchParams.get('repo')
  const source = searchParams.get('source')
  const since = searchParams.get('since')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200)
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0

  const conditions: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (repo) {
    conditions.push(`r.name = $${paramIndex++}`)
    params.push(repo)
  }
  if (source && (source === 'client' || source === 'backend')) {
    conditions.push(`ce.error_source = $${paramIndex++}`)
    params.push(source)
  }
  if (since) {
    conditions.push(`ce.last_seen_at >= $${paramIndex++}`)
    params.push(since)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM client_errors ce
       JOIN repositories r ON r.id = ce.repository_id
       ${where}`,
      params
    )
    const total = parseInt(countResult.rows[0].total, 10)

    const dataResult = await query(
      `SELECT ce.*, r.name as repository_name
       FROM client_errors ce
       JOIN repositories r ON r.id = ce.repository_id
       ${where}
       ORDER BY ce.last_seen_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    )

    return NextResponse.json({
      errors: dataResult.rows,
      total,
    })
  } catch (error) {
    console.error('Failed to fetch client errors:', error)
    return NextResponse.json({ error: 'Failed to fetch errors' }, { status: 500 })
  }
}
