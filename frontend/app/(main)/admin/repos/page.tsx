"use client"

import { useState, useEffect, useCallback } from "react"
import { ProtectedRoute } from "@/components/protected-route"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { fetchAdminRepos, createRepo, updateRepo, deleteRepo } from "@/lib/api-client"
import type { Repository } from "@/lib/db-types"
import { Plus, Pencil, Trash2, Database, X, Copy, Check, Bug } from "lucide-react"

interface EnvVar {
  key: string
  value: string
}

interface RepoFormData {
  name: string
  base_branch: string
  description: string
  enabled: boolean
  app_dir: string
  env_vars: EnvVar[]
  context: string
  error_tracking_enabled: boolean
  error_autofix_enabled: boolean
}

const emptyForm: RepoFormData = {
  name: "",
  base_branch: "main",
  description: "",
  enabled: true,
  app_dir: "",
  env_vars: [],
  context: "",
  error_tracking_enabled: false,
  error_autofix_enabled: false,
}

function repoToForm(repo: Repository): RepoFormData {
  return {
    name: repo.name,
    base_branch: repo.base_branch,
    description: repo.description || "",
    enabled: repo.enabled,
    app_dir: repo.app_dir,
    env_vars: Object.entries(repo.env_vars || {}).map(([key, value]) => ({ key, value })),
    context: repo.context || "",
    error_tracking_enabled: repo.error_tracking_enabled,
    error_autofix_enabled: repo.error_autofix_enabled,
  }
}

function formToPayload(form: RepoFormData) {
  const env_vars: Record<string, string> = {}
  for (const { key, value } of form.env_vars) {
    if (key.trim()) env_vars[key.trim()] = value
  }
  return {
    name: form.name,
    base_branch: form.base_branch,
    description: form.description,
    enabled: form.enabled,
    app_dir: form.app_dir,
    env_vars,
    context: form.context,
    error_tracking_enabled: form.error_tracking_enabled,
    error_autofix_enabled: form.error_autofix_enabled,
  }
}

export default function AdminReposPage() {
  const { user } = useAuth()
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<RepoFormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [copiedSnippet, setCopiedSnippet] = useState<number | null>(null)

  const loadRepos = useCallback(async () => {
    try {
      const data = await fetchAdminRepos()
      setRepos(data)
    } catch (err) {
      console.error("Failed to load repos:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  if (user?.role !== "admin") {
    return (
      <ProtectedRoute>
        <main className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <h3 className="font-semibold mb-1">Access Denied</h3>
              <p className="text-sm text-muted-foreground">You must be an admin to view this page.</p>
            </CardContent>
          </Card>
        </main>
      </ProtectedRoute>
    )
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setError("")
    setDialogOpen(true)
  }

  function openEdit(repo: Repository) {
    setForm(repoToForm(repo))
    setEditingId(repo.id)
    setError("")
    setDialogOpen(true)
  }

  async function handleSave() {
    setError("")
    setSaving(true)
    try {
      const payload = formToPayload(form)
      if (editingId) {
        await updateRepo(editingId, payload)
      } else {
        await createRepo(payload)
      }
      setDialogOpen(false)
      await loadRepos()
    } catch (err: any) {
      setError(err.message || "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteRepo(id)
      setDeleteConfirm(null)
      await loadRepos()
    } catch (err: any) {
      setError(err.message || "Failed to delete")
    }
  }

  function addEnvVar() {
    setForm({ ...form, env_vars: [...form.env_vars, { key: "", value: "" }] })
  }

  function removeEnvVar(index: number) {
    setForm({ ...form, env_vars: form.env_vars.filter((_, i) => i !== index) })
  }

  function updateEnvVar(index: number, field: "key" | "value", val: string) {
    const updated = form.env_vars.map((ev, i) => (i === index ? { ...ev, [field]: val } : ev))
    setForm({ ...form, env_vars: updated })
  }

  return (
    <ProtectedRoute>
      <main className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Repositories</h1>
          <Button onClick={openCreate} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Add Repository
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : repos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-1">No repositories</h3>
              <p className="text-sm text-muted-foreground">Add a repository to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Base Branch</th>
                  <th className="text-left p-3 font-medium">App Dir</th>
                  <th className="text-left p-3 font-medium">Context</th>
                  <th className="text-left p-3 font-medium">Enabled</th>
                  <th className="text-left p-3 font-medium">Error Tracking</th>
                  <th className="text-left p-3 font-medium">Env Vars</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((repo) => {
                  const snippet = `<script src="https://prengine.distark.com/client-errors.js" data-p="${repo.project_id || ""}" async></script>`
                  return (
                    <>
                      <tr key={repo.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="p-3 font-medium">{repo.name}</td>
                        <td className="p-3 text-muted-foreground">{repo.base_branch}</td>
                        <td className="p-3 text-muted-foreground">{repo.app_dir || "—"}</td>
                        <td className="p-3">
                          <Badge variant={repo.context?.trim() ? "default" : "secondary"} className="text-xs">
                            {repo.context?.trim() ? 
                              (repo.context.startsWith('http') ? "URL" : "Text") : 
                              "None"
                            }
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant={repo.enabled ? "default" : "secondary"}>
                            {repo.enabled ? "Yes" : "No"}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {repo.error_tracking_enabled ? (
                            <div className="flex items-center gap-1.5">
                              <Bug className="w-3.5 h-3.5 text-orange-600" />
                              <span className="text-xs">
                                {repo.error_autofix_enabled ? "Track + Auto-fix" : "Track only"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Off</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {Object.keys(repo.env_vars || {}).length} keys
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            {repo.error_tracking_enabled && repo.project_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Copy JS snippet"
                                onClick={() => {
                                  navigator.clipboard.writeText(snippet)
                                  setCopiedSnippet(repo.id)
                                  setTimeout(() => setCopiedSnippet(null), 2000)
                                }}
                              >
                                {copiedSnippet === repo.id ? (
                                  <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openEdit(repo)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => setDeleteConfirm(repo.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {repo.error_tracking_enabled && repo.project_id && (
                        <tr key={`${repo.id}-snippet`} className="border-b bg-muted/20">
                          <td colSpan={8} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <code className="text-[11px] bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
                                {snippet}
                              </code>
                              <code className="text-[11px] text-muted-foreground">
                                Project ID: {repo.project_id}
                              </code>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Repository" : "Add Repository"}</DialogTitle>
              <DialogDescription>
                {editingId ? "Update the repository settings." : "Configure a new repository."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="org/repo-name"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="base_branch">Base Branch</Label>
                  <Input
                    id="base_branch"
                    value={form.base_branch}
                    onChange={(e) => setForm({ ...form, base_branch: e.target.value })}
                    placeholder="main"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="app_dir">App Directory</Label>
                  <Input
                    id="app_dir"
                    value={form.app_dir}
                    onChange={(e) => setForm({ ...form, app_dir: e.target.value })}
                    placeholder="e.g. frontend/"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="context">
                  QA Context 
                  <span className="text-xs text-muted-foreground ml-2">
                    Technical context for AI analysis (architecture, flows, critical files, etc.)
                  </span>
                </Label>
                <Textarea
                  id="context"
                  value={form.context}
                  onChange={(e) => setForm({ ...form, context: e.target.value })}
                  placeholder="Architecture: Next.js frontend, Ruby worker, Redis queue. Key flows: bug report → AI agent → PR. Critical files: job_processor.rb, proofshot_backend.rb. Or URL: https://docs.company.com/myapp/architecture"
                  rows={4}
                  className="text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="enabled">Enabled</Label>
              </div>

              <div className="border-t pt-3 mt-1">
                <p className="text-sm font-medium mb-2">Error Tracking</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="error_tracking_enabled"
                      checked={form.error_tracking_enabled}
                      onChange={(e) => setForm({
                        ...form,
                        error_tracking_enabled: e.target.checked,
                        error_autofix_enabled: e.target.checked ? form.error_autofix_enabled : false,
                      })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="error_tracking_enabled">
                      Enable error tracking
                      <span className="text-xs text-muted-foreground ml-2">Accept error reports for this repo</span>
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 ml-6">
                    <input
                      type="checkbox"
                      id="error_autofix_enabled"
                      checked={form.error_autofix_enabled}
                      onChange={(e) => setForm({ ...form, error_autofix_enabled: e.target.checked })}
                      disabled={!form.error_tracking_enabled}
                      className="h-4 w-4 rounded border-gray-300 disabled:opacity-40"
                    />
                    <Label htmlFor="error_autofix_enabled" className={!form.error_tracking_enabled ? "opacity-40" : ""}>
                      Auto-create fix jobs
                      <span className="text-xs text-muted-foreground ml-2">Automatically create PRs for new errors</span>
                    </Label>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Environment Variables</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addEnvVar} className="gap-1">
                    <Plus className="w-3 h-3" />
                    Add
                  </Button>
                </div>
                {form.env_vars.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No environment variables configured.</p>
                ) : (
                  <div className="space-y-2">
                    {form.env_vars.map((ev, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input
                          value={ev.key}
                          onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                          placeholder="KEY"
                          className="font-mono"
                        />
                        <Input
                          value={ev.value}
                          onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                          placeholder="value"
                          className="font-mono"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeEnvVar(i)}
                          className="shrink-0 text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Repository</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this repository? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </ProtectedRoute>
  )
}
