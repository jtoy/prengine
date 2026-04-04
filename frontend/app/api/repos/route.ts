import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

// GET /api/repos — list available repositories (from database)
// GET /api/repos?branches=true — list repositories with their branches
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeBranches = searchParams.get('branches') === 'true'
    
    const result = await query(
      "SELECT name, base_branch FROM repositories WHERE enabled = true ORDER BY id"
    )
    const repoData = result.rows.map((r: { name: string; base_branch: string }) => ({
      name: r.name,
      base_branch: r.base_branch || 'main'
    }))
    
    // Simple response - just repo names
    if (!includeBranches) {
      return NextResponse.json(repoData.map(r => r.name))
    }
    
    // Enhanced response - repos with branches
    const reposWithBranches = await Promise.all(
      repoData.map(async (repo) => {
        try {
          const [owner, repoSlug] = repo.name.split('/')
          
          if (!owner || !repoSlug) {
            return {
              name: repo.name,
              base_branch: repo.base_branch,
              branches: [repo.base_branch, 'main', 'develop'], // fallback
              error: 'Invalid repo format'
            }
          }
          
          const response = await fetch(`https://api.github.com/repos/${owner}/${repoSlug}/branches?per_page=100`, {
            headers: {
              'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          })
          
          if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`)
          }
          
          const branches = await response.json()
          
          const branchNames = branches
            .map(branch => branch.name)
            .sort((a, b) => {
              // Sort: main, master, develop, then alphabetical
              if (a === 'main') return -1
              if (b === 'main') return 1
              if (a === 'master') return -1
              if (b === 'master') return 1
              if (a === 'develop') return -1
              if (b === 'develop') return 1
              return a.localeCompare(b)
            })
          
          return {
            name: repo.name,
            base_branch: repo.base_branch,
            branches: branchNames
          }
          
        } catch (error: any) {
          console.warn(`Failed to fetch branches for ${repo.name}:`, error.message)
          return {
            name: repo.name,
            base_branch: repo.base_branch,
            branches: [repo.base_branch, 'main', 'develop', 'master'], // fallback with repo's default first
            error: error.message
          }
        }
      })
    )
    
    return NextResponse.json(reposWithBranches)
    
  } catch (error) {
    console.error("Failed to fetch repositories:", error)
    return NextResponse.json({ error: "Failed to fetch repositories" }, { status: 500 })
  }
}
