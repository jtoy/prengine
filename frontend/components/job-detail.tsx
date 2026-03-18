"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JobStatusBadge } from "./job-status-badge"
import { FollowupForm } from "./followup-form"
import { useJobEvents } from "@/hooks/use-job-events"
import { fetchJob, fetchJobRuns, closePRs, mergePRs } from "@/lib/api-client"
import type { Job, JobRun } from "@/lib/db-types"
import {
  ExternalLink,
  GitPullRequest,
  Clock,
  FileText,
  Paperclip,
  Globe,
  Terminal,
  Sparkles,
  XCircle,
  GitMerge,
} from "lucide-react"

export function JobDetail({ jobId }: { jobId: number }) {
  const [job, setJob] = useState<Job | null>(null)
  const [runs, setRuns] = useState<JobRun[]>([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)

  const loadData = async () => {
    try {
      const [jobData, runsData] = await Promise.all([
        fetchJob(jobId),
        fetchJobRuns(jobId),
      ])
      setJob(jobData)
      setRuns(runsData)
    } catch (err) {
      console.error("Failed to load job:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [jobId])

  // SSE real-time updates
  useJobEvents(jobId, (data) => {
    if (data.job_status) {
      setJob((prev) => prev ? { ...prev, status: data.job_status, pr_url: data.pr_url || prev.pr_url } : prev)
    }
    if (data.run_id) {
      setRuns((prev) => {
        const idx = prev.findIndex((r) => r.id === data.run_id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = {
            ...updated[idx],
            status: data.run_status,
            pr_url: data.pr_url || updated[idx].pr_url,
            preview_url: data.preview_url || updated[idx].preview_url,
          }
          return updated
        }
        // New run — reload
        loadData()
        return prev
      })
    }
  })

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!job) {
    return <p className="text-center text-muted-foreground py-12">Job not found</p>
  }

  const latestRun = runs.length > 0 ? runs[runs.length - 1] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="text-muted-foreground mt-1">Job #{job.id}</p>
        </div>
        <JobStatusBadge status={job.status} />
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        {job.pr_urls && job.pr_urls.length > 0 ? (
          job.pr_urls.map((pr, i) => (
            <a key={i} href={pr.url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1">
                <GitPullRequest className="w-4 h-4" />
                PR: {pr.repo.split("/").pop()}
                <ExternalLink className="w-3 h-3" />
              </Button>
            </a>
          ))
        ) : job.pr_url ? (
          <a href={job.pr_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1">
              <GitPullRequest className="w-4 h-4" />
              View PR
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
        ) : null}
        {(job.pr_urls?.length || job.pr_url) && !["closed", "pr_merged"].includes(job.status) && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
              disabled={closing}
              onClick={async () => {
                if (!confirm("Merge all PRs for this job?")) return
                setClosing(true)
                try {
                  const updated = await mergePRs(jobId)
                  setJob(updated)
                } catch (err) {
                  console.error("Failed to merge PRs:", err)
                } finally {
                  setClosing(false)
                }
              }}
            >
              <GitMerge className="w-4 h-4" />
              {closing ? "..." : "Merge PRs"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled={closing}
              onClick={async () => {
                if (!confirm("Close all PRs for this job?")) return
                setClosing(true)
                try {
                  const updated = await closePRs(jobId)
                  setJob(updated)
                } catch (err) {
                  console.error("Failed to close PRs:", err)
                } finally {
                  setClosing(false)
                }
              }}
            >
              <XCircle className="w-4 h-4" />
              {closing ? "..." : "Close PRs"}
            </Button>
          </>
        )}
        {latestRun?.preview_url && (
          <a href={latestRun.preview_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1">
              <Globe className="w-4 h-4" />
              Preview
              <ExternalLink className="w-3 h-3" />
            </Button>
          </a>
        )}
      </div>

      {/* Description & Attachments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.summary && <p className="text-sm whitespace-pre-wrap">{job.summary}</p>}

          {job.attachments && job.attachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1">
                <Paperclip className="w-4 h-4" />
                Attachments
              </p>
              <div className="flex flex-wrap gap-2">
                {job.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    {att.filename}
                  </a>
                ))}
              </div>
            </div>
          )}

          {job.failure_reason && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700 font-medium">Failure Reason</p>
              <p className="text-sm text-red-600 mt-1">{job.failure_reason}</p>
            </div>
          )}

          {job.enriched_summary && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-medium text-blue-700 flex items-center gap-1 mb-1">
                <Sparkles className="w-3 h-3" />
                Enriched Report
              </p>
              <p className="text-sm text-blue-900 whitespace-pre-wrap">{job.enriched_summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Runs */}
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Runs ({runs.length})</TabsTrigger>
          <TabsTrigger value="followup">Follow-up</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-4 mt-4">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet</p>
          ) : (
            runs.map((run) => (
              <Card key={run.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Run #{run.run_number}
                      {run.branch_name && (
                        <span className="text-muted-foreground font-normal ml-2">
                          {run.branch_name}
                        </span>
                      )}
                    </CardTitle>
                    <JobStatusBadge status={run.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {run.prompt && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Prompt</p>
                      <p className="text-sm">{run.prompt}</p>
                    </div>
                  )}

                  {run.diff_summary && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Changes</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{run.diff_summary}</pre>
                    </div>
                  )}

                  {run.test_output && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Terminal className="w-3 h-3" /> Test Output
                      </p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">{run.test_output}</pre>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                    {run.pr_urls && run.pr_urls.length > 0 ? (
                      run.pr_urls.map((pr, i) => (
                        <a key={i} href={pr.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                          <GitPullRequest className="w-3 h-3" /> PR: {pr.repo.split("/").pop()}
                        </a>
                      ))
                    ) : run.pr_url ? (
                      <a href={run.pr_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                        <GitPullRequest className="w-3 h-3" /> PR
                      </a>
                    ) : null}
                    {run.preview_url && (
                      <a href={run.preview_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Preview
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="followup" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <FollowupForm jobId={jobId} onSubmitted={loadData} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
