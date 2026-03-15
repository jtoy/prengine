"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FileUpload } from "./file-upload"
import { createJob, fetchRepos } from "@/lib/api-client"
import type { Attachment } from "@/lib/db-types"
import { Bug, Send } from "lucide-react"

export function BugSubmissionForm() {
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [availableRepos, setAvailableRepos] = useState<string[]>([])
  const [enrich, setEnrich] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    fetchRepos()
      .then(setAvailableRepos)
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!title.trim()) {
      setError("Please enter a title")
      return
    }

    if (!summary.trim()) {
      setError("Please provide a description")
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
        selected_repos: selectedRepos.length > 0 ? selectedRepos : undefined,
        enrich: enrich || undefined,
      })
      router.push(`/jobs/${job.id}`)
    } catch (err) {
      setError("Failed to submit. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bug className="w-5 h-5 text-orange-600" />
          <CardTitle>Submit a Request</CardTitle>
        </div>
        <CardDescription>
          Describe a bug or feature request and attach any relevant screenshots or videos. Our AI agent will work on it.
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
              placeholder="Brief description of the bug or feature"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Description</Label>
            <Textarea
              id="summary"
              placeholder="Describe the bug or feature. Include steps to reproduce, expected behavior, etc."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-32"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enrich}
                onChange={(e) => setEnrich(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium">Enrich with AI</span>
            </label>
            <p className="text-xs text-muted-foreground ml-6">
              Use AI to extract steps to reproduce, expected behavior, and affected components before processing
            </p>
          </div>

          {availableRepos.length > 0 && (
            <div className="space-y-2">
              <Label>Repositories</Label>
              <p className="text-xs text-muted-foreground">Leave empty to auto-detect relevant repos</p>
              <div className="space-y-1">
                {availableRepos.map((repo) => (
                  <label key={repo} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRepos.includes(repo)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRepos((prev) => [...prev, repo])
                        } else {
                          setSelectedRepos((prev) => prev.filter((r) => r !== repo))
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    {repo}
                  </label>
                ))}
              </div>
            </div>
          )}

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
                Submit
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
