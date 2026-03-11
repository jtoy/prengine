"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileUpload } from "./file-upload"
import { createJob } from "@/lib/api-client"
import type { Attachment } from "@/lib/db-types"
import { Bug, Send } from "lucide-react"

export function BugSubmissionForm() {
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!title.trim()) {
      setError("Please enter a title for the bug report")
      return
    }

    if (!summary.trim()) {
      setError("Please describe the bug")
      return
    }

    setSubmitting(true)
    try {
      const job = await createJob({
        title: title.trim(),
        summary: summary.trim(),
        attachments: attachments.map(a => ({
          url: a.url,
          filename: a.filename,
          mime_type: a.mime_type,
        })),
      })
      router.push(`/jobs/${job.id}`)
    } catch (err) {
      setError("Failed to submit bug report. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-orange-600" />
          <CardTitle>Report a Bug</CardTitle>
        </div>
        <CardDescription>
          Describe the bug and attach any relevant screenshots or videos. Our AI agent will work on a fix.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Brief description of the bug"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Description</Label>
            <Textarea
              id="summary"
              placeholder="What happened? What did you expect? Steps to reproduce..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-32"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Attachments</Label>
            <FileUpload onFilesUploaded={setAttachments} />
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
