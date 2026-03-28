"use client"

import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { JobCard } from "@/components/job-card"
import { Button } from "@/components/ui/button"
import { fetchJobs } from "@/lib/api-client"
import type { Job } from "@/lib/db-types"
import Link from "next/link"
import { Plus, Bug } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "PR Submitted", value: "pr_submitted" },
  { label: "PR Merged", value: "pr_merged" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
]

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")

  useEffect(() => {
    fetchJobs()
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === "all"
    ? jobs
    : jobs.filter((j) => j.status === filter)

  return (
    <ProtectedRoute>
      <main className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Bug Reports</h1>
          <Link href="/submit">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Report Bug
            </Button>
          </Link>
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((sf) => (
            <Button
              key={sf.value}
              variant={filter === sf.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(sf.value)}
            >
              {sf.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No bug reports found</h3>
              <p className="text-sm text-muted-foreground">
                {filter !== "all" ? "Try a different filter" : "Submit your first bug report"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>
    </ProtectedRoute>
  )
}
