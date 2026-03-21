"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchLogs } from "@/lib/api-client"
import type { JobLog } from "@/lib/db-types"
import { Pause, Play, FileText } from "lucide-react"

const LEVEL_OPTIONS = [
  { label: "All", value: "" },
  { label: "Info", value: "info" },
  { label: "Warn", value: "warn" },
  { label: "Error", value: "error" },
]

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-blue-500",
  warn: "bg-yellow-500",
  error: "bg-red-500",
}

// Adaptive polling intervals
const POLL_FAST = 15000
const POLL_MEDIUM = 30000
const POLL_SLOW = 60000
const IDLE_MEDIUM_THRESHOLD = 30000
const IDLE_SLOW_THRESHOLD = 120000

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<JobLog[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [jobIdFilter, setJobIdFilter] = useState("")
  const [levelFilter, setLevelFilter] = useState("")
  const [pollInterval, setPollInterval] = useState(POLL_FAST)

  const [tabVisible, setTabVisible] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const lastDataAt = useRef<number>(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const loadLogs = useCallback(async (since?: string) => {
    try {
      const params: { job_id?: number; level?: string; since?: string; limit?: number } = {
        limit: 200,
      }
      if (jobIdFilter) params.job_id = parseInt(jobIdFilter, 10)
      if (levelFilter) params.level = levelFilter
      if (since) params.since = since

      const data = await fetchLogs(params)

      if (since && data.logs.length > 0) {
        lastDataAt.current = Date.now()
        setPollInterval(POLL_FAST)
        setLogs(prev => {
          const existingIds = new Set(prev.map(l => l.id))
          const newLogs = data.logs.reverse().filter(l => !existingIds.has(l.id))
          return newLogs.length > 0 ? [...prev, ...newLogs] : prev
        })
      } else if (!since) {
        // Initial load — logs are DESC, reverse for display
        setLogs(data.logs.reverse())
      }

      // Adapt polling based on idle time
      if (since && data.logs.length === 0) {
        const idleMs = Date.now() - lastDataAt.current
        if (idleMs > IDLE_SLOW_THRESHOLD) {
          setPollInterval(POLL_SLOW)
        } else if (idleMs > IDLE_MEDIUM_THRESHOLD) {
          setPollInterval(POLL_MEDIUM)
        }
      }
    } catch (err) {
      console.error("Failed to load logs:", err)
    } finally {
      setLoading(false)
    }
  }, [jobIdFilter, levelFilter])

  // Pause polling when tab is hidden
  useEffect(() => {
    const handleVisibility = () => setTabVisible(!document.hidden)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [])

  // Initial load
  useEffect(() => {
    setLoading(true)
    setLogs([])
    lastDataAt.current = Date.now()
    setPollInterval(POLL_FAST)
    loadLogs()
  }, [jobIdFilter, levelFilter, loadLogs])

  // Adaptive polling (pauses when tab is hidden)
  useEffect(() => {
    if (!live || !tabVisible) return

    timerRef.current = setInterval(() => {
      const latest = logs.length > 0 ? logs[logs.length - 1].created_at : undefined
      loadLogs(latest)
    }, pollInterval)

    return () => clearInterval(timerRef.current)
  }, [live, tabVisible, pollInterval, logs, loadLogs])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [logs, autoScroll])

  const pollLabel = !tabVisible ? "paused" : pollInterval === POLL_FAST ? "15s" : pollInterval === POLL_MEDIUM ? "30s" : "60s"

  return (
    <ProtectedRoute>
      <main className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Job Logs</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Poll: {pollLabel}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLive(!live)}
              className="gap-1"
            >
              {live ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {live ? "Pause" : "Live"}
            </Button>
            <Button
              variant={autoScroll ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              Auto-scroll
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Filter by Job ID"
            value={jobIdFilter}
            onChange={(e) => setJobIdFilter(e.target.value)}
            className="w-40"
          />
          <div className="flex gap-1">
            {LEVEL_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={levelFilter === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => setLevelFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">{logs.length} logs</span>
        </div>

        {/* Log list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No logs found</h3>
              <p className="text-sm text-muted-foreground">Logs will appear here as jobs are processed.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg bg-muted/30 max-h-[70vh] overflow-y-auto font-mono text-sm">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 px-3 py-1.5 border-b last:border-b-0 hover:bg-muted/50"
              >
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${LEVEL_COLORS[log.level] || "bg-gray-400"}`}
                />
                <span className="text-muted-foreground shrink-0 text-xs w-[140px]">
                  {new Date(log.created_at).toLocaleString()}
                </span>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {log.source}
                </Badge>
                {log.job_id && (
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    #{log.job_id}
                  </Badge>
                )}
                <span className="break-all">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </main>
    </ProtectedRoute>
  )
}
