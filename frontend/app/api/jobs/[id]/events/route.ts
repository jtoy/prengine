import { NextRequest } from "next/server"
import Redis from "ioredis"
import { query } from "@/lib/db"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const jobId = params.id

  const encoder = new TextEncoder()
  let sub: Redis | null = null

  const stream = new ReadableStream({
    async start(controller) {
      // Send current state first
      try {
        const jobResult = await query("SELECT * FROM jobs WHERE id = $1", [jobId])
        if (jobResult.rows.length > 0) {
          const job = jobResult.rows[0]
          const runsResult = await query(
            "SELECT * FROM job_runs WHERE job_id = $1 ORDER BY run_number DESC LIMIT 1",
            [jobId]
          )
          const latestRun = runsResult.rows[0] || null

          const initialData = {
            job_id: job.id,
            job_status: job.status,
            run_id: latestRun?.id || null,
            run_status: latestRun?.status || null,
            run_number: latestRun?.run_number || null,
            pr_url: job.pr_url || latestRun?.pr_url || null,
            preview_url: latestRun?.preview_url || null,
            updated_at: job.updated_at,
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`))
        }
      } catch (e) {
        console.error("Error sending initial state:", e)
      }

      // Subscribe to Redis Pub/Sub
      try {
        sub = new Redis(process.env.REDIS_URL || "redis://localhost:6379")
        const channel = `bugfixvibe:status:${jobId}`

        sub.subscribe(channel)
        sub.on("message", (_ch: string, message: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`))
          } catch (e) {
            // Stream may be closed
          }
        })
      } catch (e) {
        console.error("Error subscribing to Redis:", e)
      }

      // Send keepalive every 30s
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"))
        } catch {
          clearInterval(keepalive)
        }
      }, 30000)

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        clearInterval(keepalive)
        if (sub) {
          sub.unsubscribe()
          sub.disconnect()
        }
      })
    },
    cancel() {
      if (sub) {
        sub.unsubscribe()
        sub.disconnect()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
