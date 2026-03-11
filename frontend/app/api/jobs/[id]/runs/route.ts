import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

// GET /api/jobs/:id/runs — list runs for a job
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await query(
      "SELECT * FROM job_runs WHERE job_id = $1 ORDER BY run_number ASC",
      [params.id]
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error("Failed to fetch runs:", error)
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 })
  }
}
