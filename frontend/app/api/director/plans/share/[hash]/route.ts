import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

// GET /api/director/plans/share/:hash — public access to a shared directors plan
// No authentication required — the hash IS the access token
export async function GET(
  request: NextRequest,
  { params }: { params: { hash: string } }
) {
  try {
    const shareHash = params.hash
    if (!shareHash || shareHash.length === 0) {
      return NextResponse.json({ error: "Invalid share link" }, { status: 400 })
    }

    const planResult = await query(
      "SELECT id, title, description, share_hash, created_at FROM directors_plans WHERE share_hash = $1",
      [shareHash]
    )

    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    const plan = planResult.rows[0]

    const scenesResult = await query(
      "SELECT id, scene_number, title, description, sketch_url, notes FROM directors_plan_scenes WHERE plan_id = $1 ORDER BY scene_number ASC",
      [plan.id]
    )

    return NextResponse.json({ ...plan, scenes: scenesResult.rows })
  } catch (error) {
    console.error("Failed to fetch shared directors plan:", error)
    return NextResponse.json({ error: "Failed to fetch plan" }, { status: 500 })
  }
}
