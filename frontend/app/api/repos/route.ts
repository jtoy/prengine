import { NextResponse } from "next/server"

// GET /api/repos — list available repositories (from REPOS env var)
export async function GET() {
  const repos = (process.env.REPOS || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)

  return NextResponse.json(repos)
}
