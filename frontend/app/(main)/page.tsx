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
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

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

  const toggleFilter = (key: string) => {
    setStatusFilter((prev) => (prev === key ? null : key))
  }

  const filterMap: Record<string, Job[]> = {
    pending,
    inProgress,
    completed,
    failed,
    merged,
    closed,
  }

  const displayedJobs = statusFilter && filterMap[statusFilter]
    ? filterMap[statusFilter]
    : jobs

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
              {([
                { key: "pending", label: "Pending", count: pending.length, icon: Clock, bg: "bg-gray-100", text: "text-gray-600", ring: "ring-gray-400" },
                { key: "inProgress", label: "In Progress", count: inProgress.length, icon: Loader, bg: "bg-yellow-100", text: "text-yellow-600", ring: "ring-yellow-400" },
                { key: "completed", label: "Completed", count: completed.length, icon: CheckCircle, bg: "bg-green-100", text: "text-green-600", ring: "ring-green-400" },
                { key: "failed", label: "Failed", count: failed.length, icon: AlertCircle, bg: "bg-red-100", text: "text-red-600", ring: "ring-red-400" },
                { key: "merged", label: "Merged", count: merged.length, icon: GitMerge, bg: "bg-purple-100", text: "text-purple-600", ring: "ring-purple-400" },
                { key: "closed", label: "Closed", count: closed.length, icon: XCircle, bg: "bg-orange-100", text: "text-orange-600", ring: "ring-orange-400" },
              ] as const).map(({ key, label, count, icon: Icon, bg, text, ring }) => (
                <Card
                  key={key}
                  className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === key ? `ring-2 ${ring}` : ""}`}
                  onClick={() => toggleFilter(key)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 ${bg} rounded-lg`}>
                        <Icon className={`w-5 h-5 ${text}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-sm text-muted-foreground">{label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">
                    {statusFilter ? `${({ pending: "Pending", inProgress: "In Progress", completed: "Completed", failed: "Failed", merged: "Merged", closed: "Closed" } as Record<string, string>)[statusFilter]} Bug Reports` : "Recent Bug Reports"}
                  </h2>
                  {statusFilter && (
                    <button
                      onClick={() => setStatusFilter(null)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-full border"
                    >
                      Clear filter
                    </button>
                  )}
                </div>
                <Link href="/jobs" className="text-sm text-blue-600 hover:underline">
                  View all
                </Link>
              </div>
              {displayedJobs.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Bug className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    {statusFilter ? (
                      <>
                        <h3 className="font-semibold mb-1">No matching bug reports</h3>
                        <p className="text-sm text-muted-foreground mb-4">No bug reports with this status</p>
                        <Button variant="outline" onClick={() => setStatusFilter(null)}>Clear filter</Button>
                      </>
                    ) : (
                      <>
                        <h3 className="font-semibold mb-1">No bug reports yet</h3>
                        <p className="text-sm text-muted-foreground mb-4">Submit your first bug report to get started</p>
                        <Link href="/submit">
                          <Button>Report a Bug</Button>
                        </Link>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedJobs.slice(0, 6).map((job) => (
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
