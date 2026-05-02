"use client"

import { useState, useEffect, useCallback } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchClientErrors, fetchAdminRepos } from "@/lib/api-client"
import type { ClientError, Repository } from "@/lib/db-types"
import { AlertTriangle, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

const PAGE_SIZE = 50

export default function AdminErrorsPage() {
  const { user } = useAuth()
  const [errors, setErrors] = useState<ClientError[]>([])
  const [repos, setRepos] = useState<Repository[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [repoFilter, setRepoFilter] = useState("")
  const [sourceFilter, setSourceFilter] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const loadErrors = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchClientErrors({
        repo: repoFilter || undefined,
        source: sourceFilter || undefined,
        limit: PAGE_SIZE,
        offset,
      })
      setErrors(data.errors)
      setTotal(data.total)
    } catch (err) {
      console.error("Failed to load errors:", err)
    } finally {
      setLoading(false)
    }
  }, [repoFilter, sourceFilter, offset])

  useEffect(() => {
    fetchAdminRepos().then(setRepos).catch(console.error)
  }, [])

  useEffect(() => {
    loadErrors()
  }, [loadErrors])

  if (user?.role !== "admin") {
    return (
      <ProtectedRoute>
        <main className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="font-semibold mb-1">Access Denied</h3>
              <p className="text-sm text-muted-foreground">Admin only.</p>
            </CardContent>
          </Card>
        </main>
      </ProtectedRoute>
    )
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <ProtectedRoute>
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Client Errors</h1>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white"
            value={repoFilter}
            onChange={(e) => { setRepoFilter(e.target.value); setOffset(0) }}
          >
            <option value="">All repos</option>
            {repos.filter(r => r.error_tracking_enabled).map((r) => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </select>
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white"
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setOffset(0) }}
          >
            <option value="">All sources</option>
            <option value="client">Client</option>
            <option value="backend">Backend</option>
          </select>
          <span className="text-sm text-muted-foreground ml-auto">
            {total} error{total !== 1 ? "s" : ""} total
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : errors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No errors found</h3>
              <p className="text-sm text-muted-foreground">
                {repoFilter || sourceFilter ? "Try different filters" : "No errors have been reported yet"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Repository</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-left p-3 font-medium">Message</th>
                    <th className="text-left p-3 font-medium">Source</th>
                    <th className="text-right p-3 font-medium">Count</th>
                    <th className="text-left p-3 font-medium">Last Seen</th>
                    <th className="text-left p-3 font-medium">Job</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((err) => (
                    <>
                      <tr
                        key={err.id}
                        className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                      >
                        <td className="p-3 font-medium text-xs">{err.repository_name}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">{err.type}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground max-w-md truncate">{err.message}</td>
                        <td className="p-3">
                          <Badge variant={err.error_source === "backend" ? "destructive" : "secondary"} className="text-xs">
                            {err.error_source}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono">{err.count}</td>
                        <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                          {new Date(err.last_seen_at).toLocaleString()}
                        </td>
                        <td className="p-3">
                          {err.job_id ? (
                            <Link
                              href={`/jobs/${err.job_id}`}
                              className="text-blue-600 hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              #{err.job_id}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedId === err.id && (
                        <tr key={`${err.id}-detail`} className="border-b bg-muted/20">
                          <td colSpan={7} className="p-4">
                            <div className="space-y-2 text-xs">
                              <div>
                                <strong>Fingerprint:</strong>{" "}
                                <code className="bg-muted px-1 py-0.5 rounded">{err.fingerprint}</code>
                              </div>
                              <div>
                                <strong>First seen:</strong> {new Date(err.first_seen_at).toLocaleString()}
                              </div>
                              <div>
                                <strong>Full message:</strong>
                                <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">{err.message}</pre>
                              </div>
                              {err.stack && (
                                <div>
                                  <strong>Stack:</strong>
                                  <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap text-[11px]">{err.stack}</pre>
                                </div>
                              )}
                              {err.metadata && (
                                <div>
                                  <strong>Metadata:</strong>
                                  <pre className="mt-1 bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(err.metadata, null, 2)}</pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </ProtectedRoute>
  )
}
