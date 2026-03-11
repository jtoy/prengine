import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth-server"
import { pushJob } from "@/lib/redis"

// POST /api/jobs/:id/followup — submit a follow-up prompt
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { prompt } = body

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    // Check job exists
    const jobResult = await query("SELECT * FROM jobs WHERE id = $1", [params.id])
    if (jobResult.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    // Get next run number
    const runCountResult = await query(
      "SELECT COALESCE(MAX(run_number), 0) + 1 as next_run FROM job_runs WHERE job_id = $1",
      [params.id]
    )
    const nextRun = runCountResult.rows[0].next_run

    // Create new run
    const runResult = await query(
      `INSERT INTO job_runs (job_id, run_number, status, prompt)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [params.id, nextRun, prompt]
    )

    // Update job status back to queued
    await query(
      "UPDATE jobs SET status = 'queued', updated_at = NOW() WHERE id = $1",
      [params.id]
    )

    // Push to Redis queue
    await pushJob({
      type: "followup",
      job_id: Number(params.id),
      prompt,
      created_by: user.id,
    })

    return NextResponse.json(runResult.rows[0], { status: 201 })
  } catch (error) {
    console.error("Failed to create follow-up:", error)
    return NextResponse.json({ error: "Failed to create follow-up" }, { status: 500 })
  }
}
