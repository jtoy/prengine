import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

// GET /api/repos — list available repositories (from database)
// GET /api/repos?branches=true — list repositories with their branches
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeBranches = searchParams.get('branches') === 'true'
    
    const result = await query(
      "SELECT name FROM repositories WHERE enabled = true ORDER BY id"
    )
    const repoNames = result.rows.map((r: { name: string }) => r.name)
    
    // Simple response - just repo names
    if (!includeBranches) {
      return NextResponse.json(repoNames)
    }
    
    // Enhanced response - repos with branches
    const reposWithBranches = await Promise.all(
      repoNames.map(async (repoName) => {
        try {
          const [owner, repo] = repoName.split('/')
          
          if (!owner || !repo) {
            return {
              name: repoName,
              branches: ['main', 'develop'], // fallback
              error: 'Invalid repo format'
            }
          }
          
          const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
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
            name: repoName,
            branches: branchNames
          }
          
        } catch (error: any) {
          console.warn(`Failed to fetch branches for ${repoName}:`, error.message)
          return {
            name: repoName,
            branches: ['main', 'develop', 'master'], // fallback
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
