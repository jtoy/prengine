import { NextRequest, NextResponse } from "next/server"
import { getUserFromRequest } from "@/lib/auth-server"

const DISTARK_BASE_URL = "https://orca.distark.com"

// POST /api/upload — upload a file
// Logged-in users: upload via Distark Media.ingest! (user's own token)
// Not logged in: fall back to tmpfiles.org
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization") || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Determine media kind from MIME type
    const kind = getMediaKind(file.type)

    // If user is authenticated, upload via Distark ingest
    if (token) {
      const user = await getUserFromRequest(request)
      if (user) {
        return await uploadToDistark(file, token, kind)
      }
    }

    // Fallback: upload to tmpfiles.org for unauthenticated users
    return await uploadToTmpfiles(file)
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

async function uploadToDistark(file: File, token: string, kind: string) {
  const uploadForm = new FormData()
  uploadForm.append("file", file)
  uploadForm.append("kind", kind)
  uploadForm.append("expires_in", "3.months")

  const response = await fetch(`${DISTARK_BASE_URL}/api/v1/media/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: uploadForm,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error("Distark ingest failed:", response.status, errorData)
    return NextResponse.json({ error: "Upload failed" }, { status: 502 })
  }

  const data = await response.json()

  return NextResponse.json({
    url: data.url,
    filename: file.name,
    mime_type: file.type,
    size: file.size,
  })
}

async function uploadToTmpfiles(file: File) {
  const uploadForm = new FormData()
  uploadForm.append("file", file)

  const response = await fetch("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    body: uploadForm,
  })

  if (!response.ok) {
    return NextResponse.json({ error: "Upload failed" }, { status: 502 })
  }

  const data = await response.json()
  const url = data.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/")

  return NextResponse.json({
    url,
    filename: file.name,
    mime_type: file.type,
    size: file.size,
  })
}

function getMediaKind(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  return "document"
}
