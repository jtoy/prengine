"use client"

import { useEffect, useRef, useState } from "react"

const POLL_ACTIVE = 5000     // 5s — job is actively processing
const POLL_IDLE = 30000      // 30s — job is queued/pending, not much happening
const POLL_DONE = 0          // stop — terminal status

const ACTIVE_STATUSES = new Set([
  "processing", "cloning", "running_agent", "running_tests",
  "pushing", "creating_pr", "starting_preview",
])
const TERMINAL_STATUSES = new Set(["pr_submitted", "pr_merged", "failed", "completed"])

function intervalForStatus(status: string | null): number {
  if (!status) return POLL_IDLE
  if (TERMINAL_STATUSES.has(status)) return POLL_DONE
  if (ACTIVE_STATUSES.has(status)) return POLL_ACTIVE
  return POLL_IDLE
}

export function useJobPolling(jobId: number, onUpdate: () => void) {
  const [tabVisible, setTabVisible] = useState(true)
  const [pollInterval, setPollInterval] = useState(POLL_IDLE)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden)
    document.addEventListener("visibilitychange", handler)
    return () => document.removeEventListener("visibilitychange", handler)
  }, [])

  useEffect(() => {
    if (!tabVisible || pollInterval === POLL_DONE) return

    const timer = setInterval(() => {
      onUpdateRef.current()
    }, pollInterval)

    return () => clearInterval(timer)
  }, [jobId, tabVisible, pollInterval])

  return {
    setLastStatus: (status: string) => setPollInterval(intervalForStatus(status)),
  }
}
