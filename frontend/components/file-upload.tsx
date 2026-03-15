"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Upload, X, FileImage, FileVideo, FileText, Circle, Square } from "lucide-react"
import type { Attachment } from "@/lib/db-types"

interface FileUploadProps {
  onFilesUploaded: (attachments: Attachment[]) => void
  existingFiles?: Attachment[]
}

export function FileUpload({ onFilesUploaded, existingFiles = [] }: FileUploadProps) {
  const [files, setFiles] = useState<Attachment[]>(existingFiles)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const MAX_DURATION = 120 // seconds

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
            Authorization: `Bearer ${localStorage.getItem('bugfixvibe_token')}`,
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

  const uploadBlob = useCallback(async (blob: Blob) => {
    setUploading(true)
    try {
      const filename = `screen-recording-${Date.now()}.webm`
      const file = new File([blob], filename, { type: "video/webm" })
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("bugfixvibe_token")}`,
        },
        body: formData,
      })

      if (response.ok) {
        const attachment = await response.json()
        setFiles((prev) => {
          const updated = [...prev, attachment]
          onFilesUploaded(updated)
          return updated
        })
      }
    } catch (err) {
      console.error("Recording upload failed:", err)
    } finally {
      setUploading(false)
    }
  }, [onFilesUploaded])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })

      streamRef.current = stream
      chunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      })

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        uploadBlob(blob)
        cleanup()
      }

      // Stop if user ends screen share via browser UI
      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop()
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000) // collect data every second
      setRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev + 1 >= MAX_DURATION) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } catch (err) {
      // User cancelled the screen picker
      console.log("Screen recording cancelled")
    }
  }

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    setRecording(false)
    setRecordingTime(0)
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

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const supportsScreenRecording = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || recording}
        >
          <Upload className="w-4 h-4 mr-1" />
          {uploading ? "Uploading..." : "Upload Files"}
        </Button>

        {supportsScreenRecording && (
          recording ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={stopRecording}
            >
              <Square className="w-3 h-3 mr-1" />
              Stop Recording ({formatTime(recordingTime)})
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startRecording}
              disabled={uploading}
            >
              <Circle className="w-3 h-3 mr-1 text-red-500" />
              Record Screen
            </Button>
          )
        )}

        <span className="text-xs text-muted-foreground">
          {recording ? `Max ${MAX_DURATION / 60} min` : "Images, videos, or text files"}
        </span>
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
