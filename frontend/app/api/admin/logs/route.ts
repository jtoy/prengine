import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth-server"

// GET /api/admin/logs — fetch job logs with optional filters
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get("job_id")
    const level = searchParams.get("level")
    const since = searchParams.get("since")
    const limitParam = searchParams.get("limit")
    const limit = Math.min(Math.max(parseInt(limitParam || "100", 10) || 100, 1), 500)

    const conditions: string[] = []
    const params: (string | number)[] = []
    let paramIndex = 1

    if (jobId) {
      conditions.push(`job_id = $${paramIndex++}`)
      params.push(parseInt(jobId, 10))
    }
    if (level) {
      conditions.push(`level = $${paramIndex++}`)
      params.push(level)
    }
    if (since) {
      conditions.push(`created_at > $${paramIndex++}`)
      params.push(since)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    // Fetch limit+1 to detect has_more
    const result = await query(
      `SELECT * FROM job_logs ${where} ORDER BY created_at DESC LIMIT $${paramIndex}`,
      [...params, limit + 1]
    )

    const hasMore = result.rows.length > limit
    const logs = hasMore ? result.rows.slice(0, limit) : result.rows

    return NextResponse.json({ logs, has_more: hasMore })
  } catch (error) {
    console.error("Failed to fetch logs:", error)
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 })
  }
}
