"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-gray-500 text-white border-gray-500" },
  queued: { label: "Queued", className: "bg-blue-500 text-white border-blue-500" },
  processing: { label: "Processing", className: "bg-yellow-500 text-white border-yellow-500" },
  testing: { label: "Testing", className: "bg-purple-500 text-white border-purple-500" },
  pr_submitted: { label: "PR Submitted", className: "bg-green-500 text-white border-green-500" },
  pr_merged: { label: "PR Merged", className: "bg-emerald-600 text-white border-emerald-600" },
  failed: { label: "Failed", className: "bg-red-500 text-white border-red-500" },
  // Run statuses
  cloning: { label: "Cloning", className: "bg-blue-400 text-white border-blue-400" },
  running_agent: { label: "Running Agent", className: "bg-yellow-500 text-white border-yellow-500" },
  running_tests: { label: "Running Tests", className: "bg-purple-500 text-white border-purple-500" },
  pushing: { label: "Pushing", className: "bg-indigo-500 text-white border-indigo-500" },
  creating_pr: { label: "Creating PR", className: "bg-teal-500 text-white border-teal-500" },
  starting_preview: { label: "Starting Preview", className: "bg-cyan-500 text-white border-cyan-500" },
  completed: { label: "Completed", className: "bg-green-600 text-white border-green-600" },
}

export function JobStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: "bg-gray-400 text-white border-gray-400" }

  return (
    <Badge className={cn("border", config.className)}>
      {config.label}
    </Badge>
  )
}
