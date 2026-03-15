"use client"

import { useParams } from "next/navigation"
import { ProtectedRoute } from "@/components/protected-route"
import { JobDetail } from "@/components/job-detail"

export default function JobDetailPage() {
  const params = useParams()
  const jobId = Number(params.id)

  return (
    <ProtectedRoute>
      <main className="p-6 max-w-4xl mx-auto">
        <JobDetail jobId={jobId} />
      </main>
    </ProtectedRoute>
  )
}
