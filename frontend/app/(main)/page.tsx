"use client"

import { useState, useEffect } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { JobCard } from "@/components/job-card"
import { fetchJobs } from "@/lib/api-client"
import type { Job } from "@/lib/db-types"
import Link from "next/link"
import { Bug, Plus, Clock, CheckCircle, AlertCircle, Loader, GitMerge, XCircle, TrendingUp } from "lucide-react"

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchJobs()
      .then(setJobs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const pending = jobs.filter((j) => j.status === "pending" || j.status === "queued")
  const inProgress = jobs.filter((j) => ["processing", "testing"].includes(j.status))
  const completed = jobs.filter((j) => ["pr_submitted", "pr_merged", "completed"].includes(j.status))
  const failed = jobs.filter((j) => j.status === "failed")
  const merged = jobs.filter((j) => j.status === "pr_merged")
  const closed = jobs.filter((j) => j.status === "closed")
  const mergeRate = jobs.length > 0 ? Math.round((merged.length / jobs.length) * 100) : 0

  // Weekly stats for trend (last 8 weeks)
  const weeklyStats = (() => {
    const weeks: { label: string; total: number; merged: number }[] = []
    const now = new Date()
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - (i + 1) * 7)
      const weekEnd = new Date(now)
      weekEnd.setDate(now.getDate() - i * 7)
      const weekJobs = jobs.filter((j) => {
        const d = new Date(j.created_at)
        return d >= weekStart && d < weekEnd
      })
      const weekMerged = weekJobs.filter((j) => j.status === "pr_merged").length
      const mon = weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      weeks.push({ label: mon, total: weekJobs.length, merged: weekMerged })
    }
    return weeks.filter((w) => w.total > 0)
  })()

  return (
    <ProtectedRoute>
      <main className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Clock className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{pending.length}</p>
                      <p className="text-sm text-muted-foreground">Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-100 rounded-lg">
                      <Loader className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{inProgress.length}</p>
                      <p className="text-sm text-muted-foreground">In Progress</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{completed.length}</p>
                      <p className="text-sm text-muted-foreground">Completed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{failed.length}</p>
                      <p className="text-sm text-muted-foreground">Failed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <GitMerge className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{merged.length}</p>
                      <p className="text-sm text-muted-foreground">Merged</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <XCircle className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{closed.length}</p>
                      <p className="text-sm text-muted-foreground">Closed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{jobs.length > 0 ? `${mergeRate}%` : "—"}</p>
                      <p className="text-sm text-muted-foreground">Merge Rate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Weekly Trend */}
            {weeklyStats.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Weekly Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-24">
                    {weeklyStats.map((week, i) => {
                      const maxTotal = Math.max(...weeklyStats.map((w) => w.total), 1)
                      const barHeight = Math.max((week.total / maxTotal) * 100, 8)
                      const mergedHeight = week.total > 0 ? (week.merged / week.total) * barHeight : 0
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full relative" style={{ height: `${barHeight}%` }}>
                            <div className="absolute bottom-0 w-full bg-gray-200 rounded-sm" style={{ height: "100%" }} />
                            {mergedHeight > 0 && (
                              <div className="absolute bottom-0 w-full bg-purple-500 rounded-sm" style={{ height: `${mergedHeight}%` }} />
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">{week.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-200 rounded-sm inline-block" /> Total
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-purple-500 rounded-sm inline-block" /> Merged
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Jobs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Recent Bug Reports</h2>
                <Link href="/jobs" className="text-sm text-blue-600 hover:underline">
                  View all
                </Link>
              </div>
              {jobs.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Bug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-1">No bug reports yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">Submit your first bug report to get started</p>
                    <Link href="/submit">
                      <Button>Report a Bug</Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobs.slice(0, 6).map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </ProtectedRoute>
  )
}
