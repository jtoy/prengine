"use client"

import { useEffect, useRef } from "react"

interface JobEvent {
  job_id: number
  job_status: string
  run_id?: number
  run_status?: string
  run_number?: number
  pr_url?: string | null
  preview_url?: string | null
  updated_at: string
}

export function useJobEvents(jobId: number, onEvent: (data: JobEvent) => void) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    const token = localStorage.getItem("bugfixvibe_token")
    const url = `/api/jobs/${jobId}/events${token ? `?token=${encodeURIComponent(token)}` : ""}`

    const es = new EventSource(url)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onEventRef.current(data)
      } catch (e) {
        console.error("Failed to parse SSE event:", e)
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects on error
      console.log("SSE connection error, will auto-reconnect")
    }

    return () => {
      es.close()
    }
  }, [jobId])
}
