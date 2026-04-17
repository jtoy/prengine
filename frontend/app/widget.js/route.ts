import { NextResponse } from "next/server"
import { readFileSync } from "fs"
import { join } from "path"

export async function GET() {
  const content = readFileSync(join(process.cwd(), "public", "widget.js"), "utf-8")
  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })
}
