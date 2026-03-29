import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth-server"

async function requireAdmin(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (!user.roles.includes("admin")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { user }
}

// GET /api/admin/repos — list all repositories
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if ("error" in auth) return auth.error

    const result = await query("SELECT * FROM repositories ORDER BY name ASC")
    return NextResponse.json(result.rows)
  } catch (error) {
    console.error("Failed to fetch repos:", error)
    return NextResponse.json({ error: "Failed to fetch repositories" }, { status: 500 })
  }
}

// POST /api/admin/repos — create a repository
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if ("error" in auth) return auth.error

    const body = await request.json()
    const { name, base_branch, description, enabled, app_dir, env_vars } = body

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO repositories (name, base_branch, description, enabled, app_dir, env_vars)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name.trim(),
        base_branch || "main",
        description ?? "",
        enabled ?? true,
        app_dir || "",
        JSON.stringify(env_vars || {}),
      ]
    )

    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Repository name already exists" }, { status: 409 })
    }
    console.error("Failed to create repo:", error)
    return NextResponse.json({ error: "Failed to create repository" }, { status: 500 })
  }
}

// PATCH /api/admin/repos — update a repository
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if ("error" in auth) return auth.error

    const body = await request.json()
    const { id, ...fields } = body

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const allowedFields = ["name", "base_branch", "description", "enabled", "app_dir", "env_vars"]
    const setClauses: string[] = []
    const params: any[] = []
    let paramIndex = 1

    for (const field of allowedFields) {
      if (field in fields) {
        const value = field === "env_vars" ? JSON.stringify(fields[field]) : fields[field]
        setClauses.push(`${field} = $${paramIndex++}`)
        params.push(value)
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    setClauses.push(`updated_at = NOW()`)
    params.push(id)

    const result = await query(
      `UPDATE repositories SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      params
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Repository name already exists" }, { status: 409 })
    }
    console.error("Failed to update repo:", error)
    return NextResponse.json({ error: "Failed to update repository" }, { status: 500 })
  }
}

// DELETE /api/admin/repos — delete a repository
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if ("error" in auth) return auth.error

    const body = await request.json()
    const { id } = body

    if (!id || typeof id !== "number") {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    const result = await query("DELETE FROM repositories WHERE id = $1 RETURNING id", [id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete repo:", error)
    return NextResponse.json({ error: "Failed to delete repository" }, { status: 500 })
  }
}
