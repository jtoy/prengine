import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth-server"

// GET /api/jobs/:id — get job detail
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await query("SELECT * FROM jobs WHERE id = $1", [params.id])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error("Failed to fetch job:", error)
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 })
  }
}

// PATCH /api/jobs/:id — update job
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Close PRs action
    if (body.action === "close_prs") {
      const ghToken = process.env.GITHUB_TOKEN
      if (!ghToken) {
        return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 })
      }
      const jobResult = await query("SELECT pr_urls, pr_url FROM jobs WHERE id = $1", [params.id])
      if (jobResult.rows.length === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 })
      }
      const prUrls = jobResult.rows[0].pr_urls
      const urls = typeof prUrls === "string" ? JSON.parse(prUrls) : prUrls
      const errors: string[] = []
      if (urls && urls.length > 0) {
        for (const pr of urls) {
          const match = pr.url?.match(/github\.com\/(.+?)\/(.+?)\/pull\/(\d+)/)
          if (!match) continue
          const res = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/pulls/${match[3]}`, {
            method: "PATCH",
            headers: { Authorization: `token ${ghToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ state: "closed" }),
          })
          if (!res.ok) {
            const msg = await res.text()
            console.error(`Failed to close PR ${pr.url}: ${res.status} ${msg}`)
            errors.push(`${pr.url}: ${res.status}`)
          }
        }
      }
      if (errors.length > 0) {
        return NextResponse.json({ error: `Failed to close PRs: ${errors.join(", ")}` }, { status: 502 })
      }
      const result = await query(
        "UPDATE jobs SET status = 'closed', updated_at = NOW() WHERE id = $1 RETURNING *",
        [params.id]
      )
      return NextResponse.json(result.rows[0])
    }

    // Merge PRs action
    if (body.action === "merge_prs") {
      const ghToken = process.env.GITHUB_TOKEN
      if (!ghToken) {
        return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 })
      }
      const jobResult = await query("SELECT pr_urls, pr_url FROM jobs WHERE id = $1", [params.id])
      if (jobResult.rows.length === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 })
      }
      const prUrls = jobResult.rows[0].pr_urls
      const urls = typeof prUrls === "string" ? JSON.parse(prUrls) : prUrls
      const errors: string[] = []
      if (urls && urls.length > 0) {
        for (const pr of urls) {
          const match = pr.url?.match(/github\.com\/(.+?)\/(.+?)\/pull\/(\d+)/)
          if (!match) continue
          const res = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/pulls/${match[3]}/merge`, {
            method: "PUT",
            headers: { Authorization: `token ${ghToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ merge_method: "squash" }),
          })
          if (!res.ok) {
            const msg = await res.text()
            console.error(`Failed to merge PR ${pr.url}: ${res.status} ${msg}`)
            errors.push(`${pr.url}: ${res.status}`)
          }
        }
      }
      if (errors.length > 0) {
        return NextResponse.json({ error: `Failed to merge PRs: ${errors.join(", ")}` }, { status: 502 })
      }
      const result = await query(
        "UPDATE jobs SET status = 'pr_merged', updated_at = NOW() WHERE id = $1 RETURNING *",
        [params.id]
      )
      return NextResponse.json(result.rows[0])
    }

    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    const allowedFields = ["status", "pr_url", "diff_summary", "failure_reason", "repo_url"]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`)
        values.push(body[field])
        paramIndex++
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    updates.push(`updated_at = NOW()`)
    values.push(params.id)

    const result = await query(
      `UPDATE jobs SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    return NextResponse.json(result.rows[0])
  } catch (error) {
    console.error("Failed to update job:", error)
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 })
  }
}
