import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth-server"

// GET /api/director/plans/:id — get a single plan with scenes (authenticated)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const planId = parseInt(params.id, 10)
    if (isNaN(planId)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 })
    }

    const planResult = await query(
      "SELECT * FROM directors_plans WHERE id = $1 AND created_by = $2",
      [planId, user.id]
    )

    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 })
    }

    const plan = planResult.rows[0]

    const scenesResult = await query(
      "SELECT * FROM directors_plan_scenes WHERE plan_id = $1 ORDER BY scene_number ASC",
      [plan.id]
    )

    return NextResponse.json({ ...plan, scenes: scenesResult.rows })
  } catch (error) {
    console.error("Failed to fetch directors plan:", error)
    return NextResponse.json({ error: "Failed to fetch plan" }, { status: 500 })
  }
}
