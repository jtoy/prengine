"use client"

import { useMemo } from "react"

// --- JSONL Parsing Types ---

interface TextBlock {
  type: "text"
  text: string
}

interface ThinkingBlock {
  type: "thinking"
  thinking: string
}

interface ToolCallBlock {
  type: "tool_use" | "toolCall"
  id?: string
  toolCallId?: string
  name?: string
  toolName?: string
  input?: Record<string, unknown>
  args?: Record<string, unknown>
}

interface ToolResultContent {
  type: "tool_result"
  tool_use_id?: string
  content?: string | Array<{ type: string; text?: string }>
  is_error?: boolean
}

type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock | ToolResultContent

interface ParsedMessage {
  role: "user" | "assistant" | "toolResult"
  content: ContentBlock[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
}

// --- Parsing ---

function parseSessionContent(raw: string): ParsedMessage[] {
  const messages: ParsedMessage[] = []

  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(trimmed)
    } catch {
      continue
    }

    // Format A: plan-described format — type: "message", message.role, message.content
    // Format B: conversation JSONL — type: "user"|"assistant", message.role, message.content
    const lineType = obj.type as string
    const msg = obj.message as Record<string, unknown> | undefined
    if (!msg) continue

    const role = msg.role as string | undefined
    if (!role) continue

    // Only process message-type lines
    if (lineType === "message" || lineType === "user" || lineType === "assistant") {
      const rawContent = msg.content
      let contentBlocks: ContentBlock[] = []

      if (typeof rawContent === "string") {
        contentBlocks = [{ type: "text", text: rawContent }]
      } else if (Array.isArray(rawContent)) {
        contentBlocks = rawContent as ContentBlock[]
      }

      // Map role from either format
      let mappedRole: "user" | "assistant" | "toolResult"
      if (role === "toolResult") {
        mappedRole = "toolResult"
      } else if (role === "user") {
        // Check if this is really a tool_result container (Format B)
        const hasToolResult = contentBlocks.some((b) => b.type === "tool_result")
        mappedRole = hasToolResult ? "toolResult" : "user"
      } else {
        mappedRole = "assistant"
      }

      messages.push({
        role: mappedRole,
        content: contentBlocks,
        usage: msg.usage as ParsedMessage["usage"],
      })
    }
  }

  return messages
}

// --- Rendering helpers ---

function getToolName(block: ToolCallBlock): string {
  return block.name || block.toolName || "unknown"
}

function getToolId(block: ToolCallBlock): string {
  return block.id || block.toolCallId || ""
}

function getToolArgs(block: ToolCallBlock): Record<string, unknown> {
  return block.input || block.args || {}
}

function summarizeToolCall(block: ToolCallBlock): string {
  const name = getToolName(block)
  const args = getToolArgs(block)

  // Show the most useful arg as a preview
  const preview =
    (args.command as string) ||
    (args.pattern as string) ||
    (args.file_path as string) ||
    (args.query as string) ||
    (args.url as string) ||
    (args.content as string) ||
    ""

  const short = typeof preview === "string" ? preview.slice(0, 80) : ""
  return short ? `${name}: ${short}${preview.length > 80 ? "…" : ""}` : name
}

function toolResultText(block: ToolResultContent | ContentBlock): string {
  if (block.type !== "tool_result") return ""
  const tr = block as ToolResultContent
  if (typeof tr.content === "string") return tr.content
  if (Array.isArray(tr.content)) {
    return tr.content
      .map((c) => (c.text ? c.text : JSON.stringify(c)))
      .join("\n")
  }
  return ""
}

// --- Component ---

export function SessionTranscript({ content }: { content: string }) {
  const messages = useMemo(() => parseSessionContent(content), [content])

  // Build a map from toolCallId → toolResult content for inline display
  const toolResults = useMemo(() => {
    const map = new Map<string, { text: string; isError: boolean }>()
    for (const msg of messages) {
      if (msg.role !== "toolResult") continue
      for (const block of msg.content) {
        if (block.type === "tool_result") {
          const tr = block as ToolResultContent
          const id = tr.tool_use_id || ""
          if (id) {
            map.set(id, { text: toolResultText(tr), isError: !!tr.is_error })
          }
        }
      }
    }
    return map
  }, [messages])

  // Sum tokens for cost display
  const totalTokens = useMemo(() => {
    let input = 0
    let output = 0
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.usage) {
        input += msg.usage.input_tokens || 0
        output += msg.usage.output_tokens || 0
      }
    }
    return { input, output }
  }, [messages])

  if (messages.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No session data</p>
  }

  return (
    <div className="space-y-3 mt-2">
      {messages.map((msg, i) => {
        // Skip user messages (prompt already shown) and toolResult messages (shown inline under tool calls)
        if (msg.role === "user" || msg.role === "toolResult") return null

        // Assistant message — render each content block
        return (
          <div key={i} className="space-y-2">
            {msg.content.map((block, j) => {
              if (block.type === "text") {
                const text = (block as TextBlock).text
                if (!text.trim()) return null
                return (
                  <div key={j} className="text-sm whitespace-pre-wrap">
                    {text}
                  </div>
                )
              }

              if (block.type === "thinking") {
                const thinking = (block as ThinkingBlock).thinking
                return (
                  <details key={j} className="group">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                      Thinking…
                    </summary>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 p-2 rounded mt-1 max-h-60 overflow-y-auto">
                      {thinking}
                    </div>
                  </details>
                )
              }

              if (block.type === "tool_use" || block.type === "toolCall") {
                const tb = block as ToolCallBlock
                const id = getToolId(tb)
                const result = id ? toolResults.get(id) : undefined
                const argsJson = JSON.stringify(getToolArgs(tb), null, 2)

                return (
                  <details key={j} className="group border border-border rounded">
                    <summary className="text-xs font-mono px-2 py-1 cursor-pointer hover:bg-muted/50 flex items-center gap-1">
                      <span className="text-orange-600">⚙</span>
                      {summarizeToolCall(tb)}
                    </summary>
                    <div className="px-2 py-1 space-y-1 border-t border-border">
                      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
                        {argsJson}
                      </pre>
                      {result && (
                        <div
                          className={`text-xs p-2 rounded overflow-x-auto max-h-40 ${
                            result.isError
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-muted"
                          }`}
                        >
                          <pre className="whitespace-pre-wrap">{result.text}</pre>
                        </div>
                      )}
                    </div>
                  </details>
                )
              }

              return null
            })}
          </div>
        )
      })}

      {/* Token summary */}
      {(totalTokens.input > 0 || totalTokens.output > 0) && (
        <div className="text-xs text-muted-foreground pt-2 border-t border-border">
          Tokens — input: {totalTokens.input.toLocaleString()}, output:{" "}
          {totalTokens.output.toLocaleString()}
        </div>
      )}
    </div>
  )
}
