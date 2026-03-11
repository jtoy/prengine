"use client"

import { ProtectedRoute } from "@/components/protected-route"
import { BugSubmissionForm } from "@/components/bug-submission-form"

export default function SubmitPage() {
  return (
    <ProtectedRoute>
      <main className="p-6">
        <BugSubmissionForm />
      </main>
    </ProtectedRoute>
  )
}
