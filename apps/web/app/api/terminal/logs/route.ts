import { NextResponse } from "next/server"
import { readSandboxLogs } from "@/lib/e2b-terminal"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sandboxId?: string }

    if (!body.sandboxId) {
      return NextResponse.json({ error: "sandboxId is required" }, { status: 400 })
    }

    const logs = await readSandboxLogs(body.sandboxId)
    return NextResponse.json({ logs })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read logs",
      },
      { status: 500 }
    )
  }
}
