import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns the best supported mimeType for MediaRecorder video recording.
 * Prefers WebM with VP9, then plain WebM, then MP4, then default.
 * Also returns the file extension.
 */
export function getRecordingMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "video/webm", extension: "webm" }
  }

  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return { mimeType: "video/webm;codecs=vp9", extension: "webm" }
  }
  if (MediaRecorder.isTypeSupported("video/webm")) {
    return { mimeType: "video/webm", extension: "webm" }
  }
  if (MediaRecorder.isTypeSupported("video/mp4")) {
    return { mimeType: "video/mp4", extension: "mp4" }
  }

  // Fallback: let the browser pick
  return { mimeType: "", extension: "webm" }
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = localStorage.getItem("distark_token")

  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  return fetch(url, {
    ...options,
    headers,
  })
}
