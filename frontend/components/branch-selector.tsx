"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GitBranch, Loader2 } from "lucide-react"

interface BranchSelectorProps {
  selectedRepos: string[]
  sourceBranch: string
  targetBranch: string
  onSourceBranchChange: (branch: string) => void
  onTargetBranchChange: (branch: string) => void
}

interface RepoWithBranches {
  name: string
  branches: string[]
  error?: string
}

export function BranchSelector({
  selectedRepos,
  sourceBranch,
  targetBranch,
  onSourceBranchChange,
  onTargetBranchChange,
}: BranchSelectorProps) {
  const [reposWithBranches, setReposWithBranches] = useState<RepoWithBranches[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Get unique branches from selected repositories
  const availableBranches = Array.from(
    new Set(
      reposWithBranches
        .filter(repo => selectedRepos.includes(repo.name))
        .flatMap(repo => repo.branches)
    )
  ).sort((a, b) => {
    // Sort: main, master, develop, then alphabetical
    if (a === 'main') return -1
    if (b === 'main') return 1
    if (a === 'master') return -1
    if (b === 'master') return 1
    if (a === 'develop') return -1
    if (b === 'develop') return 1
    return a.localeCompare(b)
  })

  // Fetch repos with branches on component mount
  useEffect(() => {
    const fetchReposWithBranches = async () => {
      setLoading(true)
      setError("")
      
      try {
        const response = await fetch('/api/repos?branches=true')
        if (!response.ok) {
          throw new Error('Failed to fetch repositories with branches')
        }
        
        const data: RepoWithBranches[] = await response.json()
        setReposWithBranches(data)
        
      } catch (err: any) {
        setError(err.message || "Failed to fetch branches")
        console.error('Branch fetch error:', err)
      }
      
      setLoading(false)
    }

    fetchReposWithBranches()
  }, [])

  // Auto-select sensible defaults when repos are selected
  useEffect(() => {
    if (selectedRepos.length === 0 || availableBranches.length === 0) {
      return
    }

    // Auto-select source branch if not set
    if (!sourceBranch) {
      if (availableBranches.includes('main')) {
        onSourceBranchChange('main')
      } else if (availableBranches.includes('develop')) {
        onSourceBranchChange('develop')
      } else if (availableBranches.length > 0) {
        onSourceBranchChange(availableBranches[0])
      }
    }
    
    // Auto-select target branch if not set
    if (!targetBranch) {
      if (availableBranches.includes('main')) {
        onTargetBranchChange('main')
      } else if (availableBranches.includes('develop')) {
        onTargetBranchChange('develop')
      } else if (availableBranches.length > 0) {
        onTargetBranchChange(availableBranches[0])
      }
    }
  }, [selectedRepos, availableBranches, sourceBranch, targetBranch, onSourceBranchChange, onTargetBranchChange])

  if (selectedRepos.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-orange-600" />
        <Label className="text-base font-medium">Branch Strategy</Label>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
      
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="source-branch">Source Branch</Label>
          <Select value={sourceBranch} onValueChange={onSourceBranchChange} disabled={availableBranches.length === 0}>
            <SelectTrigger id="source-branch">
              <SelectValue placeholder={loading ? "Loading branches..." : "Select source branch"} />
            </SelectTrigger>
            <SelectContent>
              {availableBranches.map(branch => (
                <SelectItem key={branch} value={branch}>
                  {branch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Branch to create the fix from
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="target-branch">Target Branch</Label>
          <Select value={targetBranch} onValueChange={onTargetBranchChange} disabled={availableBranches.length === 0}>
            <SelectTrigger id="target-branch">
              <SelectValue placeholder={loading ? "Loading branches..." : "Select target branch"} />
            </SelectTrigger>
            <SelectContent>
              {availableBranches.map(branch => (
                <SelectItem key={branch} value={branch}>
                  {branch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Branch for the PR to merge into
          </p>
        </div>
      </div>
      
      {sourceBranch && targetBranch && availableBranches.length > 0 && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <strong>Workflow:</strong> Create <code>bugfix/job-*</code> from <code>{sourceBranch}</code> → PR merges into <code>{targetBranch}</code>
        </div>
      )}

      {selectedRepos.length > 0 && availableBranches.length === 0 && !loading && (
        <div className="text-sm text-muted-foreground bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
          <strong>No branches found</strong> for selected repositories. Default repository settings will be used.
        </div>
      )}
    </div>
  )
}