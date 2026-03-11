import type { Attachment } from './db-types'

export async function uploadFile(file: File): Promise<Attachment> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`)
  }

  const data = await response.json()

  // tmpfiles.org returns { status: "success", data: { url: "https://tmpfiles.org/12345/file.png" } }
  // Convert to direct download URL by inserting /dl/ after domain
  const url = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/')

  return {
    url,
    filename: file.name,
    mime_type: file.type,
    size: file.size,
  }
}
