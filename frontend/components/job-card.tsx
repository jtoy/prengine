"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { JobStatusBadge } from "./job-status-badge"
import type { Job } from "@/lib/db-types"
import { Clock, Paperclip } from "lucide-react"

export function JobCard({ job }: { job: Job }) {
  const timeAgo = getTimeAgo(new Date(job.created_at))

  return (
    <Link href={`/jobs/${job.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base line-clamp-2">{job.title}</CardTitle>
            <JobStatusBadge status={job.status} />
          </div>
        </CardHeader>
        <CardContent>
          {job.summary && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{job.summary}</p>
          )}
          <p className="text-xs text-muted-foreground mb-3">
            {job.mode === "review" ? "Review" : "Build"} mode
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {job.created_by_name ? (
              <span>{job.created_by_name}</span>
            ) : null}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
            {job.attachments && job.attachments.length > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="w-3 h-3" />
                {job.attachments.length} file{job.attachments.length !== 1 ? "s" : ""}
              </span>
            )}
            {job.pr_url && (
              <span className="text-green-600 font-medium">PR ready</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
