"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { EmbedFileUpload } from "./embed-file-upload"
import type { Attachment } from "@/lib/db-types"
import { Bug, Send, CheckCircle } from "lucide-react"

interface ErrorContext {
  message: string
  stack?: string
  source?: string
  lineno?: number
  colno?: number
  url?: string
  timestamp?: number
}

interface EmbedSubmissionFormProps {
  project: string
}

export function EmbedSubmissionForm({ project }: EmbedSubmissionFormProps) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null)
  const [authError, setAuthError] = useState(false)
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const readyPosted = useRef(false)

  // Listen for auth token from parent via postMessage
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "PRENGINE_AUTH_TOKEN") {
        const receivedToken = event.data.token
        if (!receivedToken) {
          setAuthError(true)
          return
        }

        // Validate token
        try {
          const res = await fetch("/api/me", {
            headers: { Authorization: `Bearer ${receivedToken}` },
          })
          if (res.ok) {
            const userData = await res.json()
            setToken(receivedToken)
            setUser(userData)

            // Pre-fill with error context if provided
            const errors: ErrorContext[] = event.data.errors
            if (errors && errors.length > 0) {
              const latest = errors[0]
              setTitle(latest.message || "Error report")
              const parts: string[] = []
              if (latest.url) parts.push(`Page: ${latest.url}`)
              if (latest.source && latest.lineno) {
                parts.push(`Source: ${latest.source}:${latest.lineno}${latest.colno ? `:${latest.colno}` : ""}`)
              }
              if (latest.stack) parts.push(`\nStack trace:\n${latest.stack}`)
              if (errors.length > 1) {
                parts.push(`\n--- ${errors.length - 1} additional error(s) ---`)
                errors.slice(1).forEach((err, i) => {
                  parts.push(`\n${i + 2}. ${err.message}${err.url ? ` (${err.url})` : ""}`)
                })
              }
              setSummary(parts.join("\n"))
            }
          } else {
            setAuthError(true)
          }
        } catch {
          setAuthError(true)
        }
      }
    }

    window.addEventListener("message", handleMessage)

    // Signal to parent that iframe is ready
    if (!readyPosted.current) {
      readyPosted.current = true
      window.parent.postMessage({ type: "PRENGINE_IFRAME_READY" }, "*")
    }

    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!title.trim()) {
      setError("Please enter a title")
      return
    }
    if (!summary.trim()) {
      setError("Please describe the bug")
      return
    }
    if (!token) {
      setError("Not authenticated")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          attachments: attachments.map((a) => ({
            url: a.url,
            filename: a.filename,
            mime_type: a.mime_type,
          })),
          source_project: project || undefined,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to submit")
      }

      const job = await res.json()
      setSubmitted(true)

      // Notify parent of success
      window.parent.postMessage({ type: "PRENGINE_SUBMIT_SUCCESS", jobId: job.id }, "*")
    } catch {
      setError("Failed to submit bug report. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (authError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Authentication failed. Please log in to the app and try again.</p>
        </CardContent>
      </Card>
    )
  }

  if (!token) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle className="w-12 h-12 mx-auto text-green-600 mb-4" />
          <h3 className="font-semibold mb-1">Bug Report Submitted</h3>
          <p className="text-sm text-muted-foreground">Our AI agent will start working on a fix.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-orange-600" />
          <CardTitle>Submit a Request</CardTitle>
        </div>
        <CardDescription>
          Describe a bug or feature request and attach any relevant files.
          {project && <span className="ml-1 text-xs font-mono bg-muted px-1 rounded">{project}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="embed-title">Title</Label>
            <Input
              id="embed-title"
              placeholder="Brief description of the bug"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="embed-summary">Description</Label>
            <Textarea
              id="embed-summary"
              placeholder="What happened? What did you expect?"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-32"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Attachments</Label>
            <EmbedFileUpload token={token} onFilesUploaded={setAttachments} />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1" />
                Submit Bug Report
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
