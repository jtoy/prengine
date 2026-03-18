import { NextResponse } from "next/server"
import { query } from "@/lib/db"

// GET /api/repos — list available repositories (from database)
export async function GET() {
  const result = await query(
    "SELECT name FROM repositories WHERE enabled = true ORDER BY id"
  )
  const repos = result.rows.map((r: { name: string }) => r.name)
  return NextResponse.json(repos)
}
