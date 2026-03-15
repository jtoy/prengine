"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload, X, FileImage, FileVideo, FileText } from "lucide-react"
import type { Attachment } from "@/lib/db-types"

interface EmbedFileUploadProps {
  token: string
  onFilesUploaded: (attachments: Attachment[]) => void
  existingFiles?: Attachment[]
}

export function EmbedFileUpload({ token, onFilesUploaded, existingFiles = [] }: EmbedFileUploadProps) {
  const [files, setFiles] = useState<Attachment[]>(existingFiles)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) return

    setUploading(true)
    try {
      const newAttachments: Attachment[] = []
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        })

        if (response.ok) {
          const attachment = await response.json()
          newAttachments.push(attachment)
        }
      }

      const updated = [...files, ...newAttachments]
      setFiles(updated)
      onFilesUploaded(updated)
    } catch (err) {
      console.error("Upload failed:", err)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index)
    setFiles(updated)
    onFilesUploaded(updated)
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <FileImage className="w-4 h-4" />
    if (mimeType.startsWith("video/")) return <FileVideo className="w-4 h-4" />
    return <FileText className="w-4 h-4" />
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="w-4 h-4 mr-1" />
          {uploading ? "Uploading..." : "Upload Files"}
        </Button>
        <span className="text-xs text-muted-foreground">Images, videos, or text files</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,.txt,.log,.md"
        className="hidden"
        onChange={handleFileChange}
      />

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm">
              {getFileIcon(file.mime_type)}
              <span className="flex-1 truncate">{file.filename}</span>
              {file.size && (
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)}KB
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => removeFile(i)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
