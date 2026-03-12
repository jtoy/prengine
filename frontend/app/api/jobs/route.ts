import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth-server"
import { pushJob } from "@/lib/redis"

// GET /api/jobs — list all jobs
export async function GET(request: NextRequest) {
  try {
    const result = await query(
      "SELECT * FROM jobs ORDER BY created_at DESC"
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error("Failed to fetch jobs:", error)
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 })
  }
}

// POST /api/jobs — create a new job
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { title, summary, attachments = [], selected_repos = [] } = body

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO jobs (title, summary, attachments, selected_repos, created_by, created_by_email, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued')
       RETURNING *`,
      [title, summary, JSON.stringify(attachments), JSON.stringify(selected_repos), user.id, user.email]
    )

    const job = result.rows[0]

    // Push to Redis queue
    await pushJob({
      type: "new_job",
      job_id: job.id,
      title: job.title,
      summary: job.summary,
      attachments,
      created_by: user.id,
    })

    return NextResponse.json(job, { status: 201 })
  } catch (error) {
    console.error("Failed to create job:", error)
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
  }
}
