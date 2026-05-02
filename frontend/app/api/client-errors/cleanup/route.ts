import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const result = await query(
      `DELETE FROM client_errors WHERE last_seen_at < NOW() - INTERVAL '90 days' RETURNING id`
    )
    const deleted = result.rowCount || 0
    console.log(`[cleanup] Deleted ${deleted} old client errors`)
    return NextResponse.json({ deleted })
  } catch (error) {
    console.error('Cleanup failed:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
