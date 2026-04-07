"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { JobStatusBadge } from "./job-status-badge"
import { FollowupForm } from "./followup-form"
import { useJobPolling } from "@/hooks/use-job-events"
import { fetchJob, fetchJobRuns, fetchLogs, closePRs, mergePRs, updateJob } from "@/lib/api-client"
import type { Job, JobRun, JobLog } from "@/lib/db-types"
import { SessionTranscript } from "./session-transcript"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
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
  MessageSquare,
  Check,
  X,
  Pencil,
} from "lucide-react"

export function JobDetail({ jobId }: { jobId: number }) {
  const [job, setJob] = useState<Job | null>(null)
  const [runs, setRuns] = useState<JobRun[]>([])
  const [logs, setLogs] = useState<JobLog[]>([])
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [closeNote, setCloseNote] = useState("")
  const [editingNote, setEditingNote] = useState(false)
  const [noteValue, setNoteValue] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const loadData = async () => {
    try {
      const [jobData, runsData, logsData] = await Promise.all([
        fetchJob(jobId),
        fetchJobRuns(jobId),
        fetchLogs({ job_id: jobId, limit: 500 }).catch(() => ({ logs: [], has_more: false })),
      ])
      setJob(jobData)
      setRuns(runsData)
      setLogs(logsData.logs)
    } catch (err) {
      console.error("Failed to load job:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [jobId])

  // Poll for updates (pauses on hidden tab and terminal statuses)
  const { setLastStatus } = useJobPolling(jobId, loadData)

  useEffect(() => {
    if (job) setLastStatus(job.status)
  }, [job?.status])

  const saveNote = async () => {
    if (!job) return
    setSavingNote(true)
    const prev = job.note
    setJob({ ...job, note: noteValue.trim() || null })
    setEditingNote(false)
    try {
      const updated = await updateJob(jobId, { note: noteValue.trim() || null })
      setJob(updated)
    } catch (err) {
      console.error("Failed to save note:", err)
      setJob({ ...job, note: prev })
      setEditingNote(true)
    } finally {
      setSavingNote(false)
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return "< 1s"
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rem = s % 60
    if (m < 60) return rem > 0 ? `${m}m ${rem}s` : `${m}m`
    const h = Math.floor(m / 60)
    const remM = m % 60
    return remM > 0 ? `${h}h ${remM}m` : `${h}h`
  }

  function parseStepTimings(runLogs: JobLog[], run: JobRun) {
    const runStart = new Date(run.created_at).getTime()
    const runEnd = run.finished_at
      ? new Date(run.finished_at).getTime() + 30_000
      : Date.now()

    const stepLogs = runLogs
      .filter(l => {
        const t = new Date(l.created_at).getTime()
        return t >= runStart - 5_000 && t <= runEnd && /^Step \d+:/.test(l.message)
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    if (stepLogs.length === 0) return []

    const stepMap = new Map<number, { firstTs: number; lastTs: number; label: string }>()
    for (const log of stepLogs) {
      const match = log.message.match(/^Step (\d+): (.+)/)
      if (!match) continue
      const n = parseInt(match[1])
      const ts = new Date(log.created_at).getTime()
      if (!stepMap.has(n)) {
        stepMap.set(n, { firstTs: ts, lastTs: ts, label: match[2] })
      } else {
        stepMap.get(n)!.lastTs = ts
      }
    }

    const sorted = [...stepMap.entries()].sort(([a], [b]) => a - b)

    return sorted.map(([n, data], i) => {
      const nextData = sorted[i + 1]?.[1]
      const endTs = nextData ? nextData.firstTs : data.lastTs
      const label = data.label.length > 60 ? data.label.slice(0, 60) + "…" : data.label
      return { num: n, label, durationMs: Math.max(0, endTs - data.firstTs) }
    })
  }

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
          <p className="text-muted-foreground mt-1">
            Job #{job.id}{job.created_by_name ? ` by ${job.created_by_name}` : ""} • {job.mode === "review" ? "Review" : "Build"} mode
          </p>
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
              onClick={() => {
                setCloseNote(job.note ?? "")
                setShowCloseDialog(true)
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

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
            <p className="text-sm font-medium text-slate-700 flex items-center gap-1 mb-1">
              <MessageSquare className="w-3 h-3" />
              Note
            </p>
            {editingNote ? (
              <div className="space-y-2">
                <Textarea
                  ref={noteRef}
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  rows={3}
                  className="text-sm"
                  placeholder="Add a note..."
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditingNote(false)
                      setNoteValue(job.note ?? "")
                    }
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      saveNote()
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 gap-1 text-green-700 hover:text-green-800 hover:bg-green-50"
                    disabled={savingNote}
                    onClick={saveNote}
                  >
                    <Check className="w-3 h-3" />
                    {savingNote ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 gap-1 text-slate-500"
                    disabled={savingNote}
                    onClick={() => {
                      setEditingNote(false)
                      setNoteValue(job.note ?? "")
                    }}
                  >
                    <X className="w-3 h-3" />
                    Cancel
                  </Button>
                  <span className="text-xs text-muted-foreground ml-auto">Ctrl+Enter to save · Esc to cancel</span>
                </div>
              </div>
            ) : (
              <button
                className="w-full text-left group"
                onClick={() => {
                  setNoteValue(job.note ?? "")
                  setEditingNote(true)
                  setTimeout(() => noteRef.current?.focus(), 0)
                }}
              >
                {job.note ? (
                  <span className="flex items-start gap-2">
                    <span className="text-sm text-slate-600 whitespace-pre-wrap flex-1">{job.note}</span>
                    <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                  </span>
                ) : (
                  <span className="text-sm text-slate-400 italic group-hover:text-slate-500 transition-colors">
                    Add a note...
                  </span>
                )}
              </button>
            )}
          </div>

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
            runs.map((run) => {
              const stepTimings = parseStepTimings(logs, run)
              const totalMs = run.finished_at
                ? new Date(run.finished_at).getTime() - new Date(run.created_at).getTime()
                : null
              return (
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

                  {run.session_content && (
                    <details className="group">
                      <summary className="text-xs font-medium text-muted-foreground cursor-pointer flex items-center gap-1 hover:text-foreground">
                        <Terminal className="w-3 h-3" /> Session Transcript
                      </summary>
                      <SessionTranscript content={run.session_content} />
                    </details>
                  )}

                  {stepTimings.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Step Timings
                      </p>
                      <div className="rounded border border-border overflow-hidden text-xs">
                        {stepTimings.map((step) => (
                          <div
                            key={step.num}
                            className="flex items-center gap-2 px-2 py-1 odd:bg-muted/40"
                          >
                            <span className="w-4 text-muted-foreground shrink-0 text-center">{step.num}</span>
                            <span className="flex-1 truncate text-foreground">{step.label}</span>
                            <span className={`font-mono shrink-0 tabular-nums ${
                              step.durationMs > 120_000
                                ? "text-red-600 font-semibold"
                                : step.durationMs > 30_000
                                ? "text-yellow-600"
                                : "text-muted-foreground"
                            }`}>
                              {formatDuration(step.durationMs)}
                            </span>
                          </div>
                        ))}
                        {totalMs !== null && (
                          <div className="flex items-center gap-2 px-2 py-1 border-t border-border bg-muted/60">
                            <span className="w-4 shrink-0" />
                            <span className="flex-1 text-muted-foreground">Total</span>
                            <span className="font-mono shrink-0 tabular-nums font-medium text-foreground">
                              {formatDuration(totalMs)}
                            </span>
                          </div>
                        )}
                      </div>
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
              )
            })
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

      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close PRs</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              This will close all open PRs for this job on GitHub.
            </p>
            <Textarea
              placeholder="Add a note explaining why (optional)"
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={closing}
              onClick={async () => {
                setShowCloseDialog(false)
                setClosing(true)
                try {
                  const updated = await closePRs(jobId, closeNote.trim() || undefined)
                  setJob(updated)
                } catch (err) {
                  console.error("Failed to close PRs:", err)
                } finally {
                  setClosing(false)
                }
              }}
            >
              {closing ? "Closing..." : "Close PRs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
