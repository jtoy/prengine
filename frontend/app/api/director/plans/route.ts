import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth-server"
import { generateShareHash } from "@/lib/hashid"

// GET /api/director/plans — list plans for current user
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await query(
      "SELECT * FROM directors_plans WHERE created_by = $1 ORDER BY created_at DESC",
      [user.id]
    )
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error("Failed to fetch directors plans:", error)
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 })
  }
}

// POST /api/director/plans — create a new directors plan with scenes
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, scenes = [] } = body

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return NextResponse.json({ error: "At least one scene is required" }, { status: 400 })
    }

    const shareHash = generateShareHash()

    const planResult = await query(
      `INSERT INTO directors_plans (title, description, share_hash, created_by, created_by_email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [title, description || null, shareHash, user.id, user.email]
    )

    const plan = planResult.rows[0]

    const sceneRows = []
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const sceneResult = await query(
        `INSERT INTO directors_plan_scenes (plan_id, scene_number, title, description, sketch_url, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [plan.id, i + 1, scene.title || null, scene.description || null, scene.sketch_url || null, scene.notes || null]
      )
      sceneRows.push(sceneResult.rows[0])
    }

    return NextResponse.json({ ...plan, scenes: sceneRows }, { status: 201 })
  } catch (error) {
    console.error("Failed to create directors plan:", error)
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 })
  }
}
