"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { submitFollowup } from "@/lib/api-client"
import { Send } from "lucide-react"

interface FollowupFormProps {
  jobId: number
  onSubmitted: () => void
}

export function FollowupForm({ jobId, onSubmitted }: FollowupFormProps) {
  const [prompt, setPrompt] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return

    setSubmitting(true)
    try {
      await submitFollowup(jobId, prompt.trim())
      setPrompt("")
      onSubmitted()
    } catch (err) {
      console.error("Failed to submit follow-up:", err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Label htmlFor="followup">Follow-up Prompt</Label>
      <Textarea
        id="followup"
        placeholder="Provide additional instructions or feedback..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="min-h-20"
      />
      <Button type="submit" size="sm" disabled={submitting || !prompt.trim()}>
        {submitting ? (
          <>
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
            Sending...
          </>
        ) : (
          <>
            <Send className="w-3 h-3 mr-1" />
            Send Follow-up
          </>
        )}
      </Button>
    </form>
  )
}
