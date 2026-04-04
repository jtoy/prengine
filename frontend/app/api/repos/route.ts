import { NextRequest, NextResponse } from "next/server"
import { query } from "@/lib/db"

// Fetch all branches from a repository with pagination
async function fetchAllBranches(owner: string, repo: string): Promise<any[]> {
  const allBranches: any[] = []
  let page = 1
  const perPage = 100 // GitHub's max per page
  const maxPages = 20 // Safety limit (2000 branches max)

  while (page <= maxPages) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`, 
        {
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
          },
          // Note: 30 second Vercel function timeout should handle slow repos
        }
      )

      if (!response.ok) {
        if (page === 1) {
          // First page failed - throw error
          throw new Error(`GitHub API error: ${response.status}`)
        }
        // Subsequent page failed - just stop pagination
        break
      }

      const branches = await response.json()
      
      if (!Array.isArray(branches) || branches.length === 0) {
        // No more branches - end pagination
        break
      }

      allBranches.push(...branches)

      // If we got fewer than perPage results, we've reached the end
      if (branches.length < perPage) {
        break
      }

      page++
      
    } catch (error) {
      console.warn(`Error fetching page ${page} for ${owner}/${repo}:`, error)
      break
    }
  }

  console.log(`[GitHub API] Fetched ${allBranches.length} branches for ${owner}/${repo} (${page - 1} pages)`)
  return allBranches
}

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
          
          // Fetch all branches with pagination
          const allBranches = await fetchAllBranches(owner, repoSlug)
          
          const branchNames = allBranches
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
