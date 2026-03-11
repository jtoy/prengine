import { NextRequest, NextResponse } from "next/server"
import { getUserFromRequest } from "@/lib/auth-server"

// POST /api/upload — upload a file
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Upload to tmpfiles.org
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

    // Convert to direct download URL
    const url = data.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/")

    return NextResponse.json({
      url,
      filename: file.name,
      mime_type: file.type,
      size: file.size,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
