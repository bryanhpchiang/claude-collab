import { NextResponse } from "next/server"
import { createOrConnectSession, destroySession } from "@/lib/e2b-terminal"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sandboxId?: string
      cols?: number
      rows?: number
    }

    const session = await createOrConnectSession(
      body.sandboxId,
      body.cols ?? 120,
      body.rows ?? 32
    )

    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create E2B session",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { sandboxId?: string }

    if (!body.sandboxId) {
      return NextResponse.json({ error: "sandboxId is required" }, { status: 400 })
    }

    await destroySession(body.sandboxId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to destroy E2B session",
      },
      { status: 500 }
    )
  }
}
