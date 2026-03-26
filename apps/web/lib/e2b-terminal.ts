import { Sandbox } from "@e2b/code-interpreter"

const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000
const RELAY_PORT = 8080
const RELAY_DIR = "/home/user/e2b-pty-relay"
const RELAY_PATH = `${RELAY_DIR}/server.ts`
const RELAY_PACKAGE_PATH = `${RELAY_DIR}/package.json`
const RELAY_PID_PATH = "/home/user/e2b-pty-relay.pid"
const RELAY_LOG_PATH = "/home/user/e2b-pty-relay.log"

const SYSTEM_PROMPT = `You are in a MULTIPLAYER session. Multiple users are typing messages to you through a shared web terminal.

NEVER write code directly in the main conversation. ALWAYS delegate code writing, file editing, and implementation to background agents using the Agent tool with run_in_background:true.

Launch multiple agents in parallel when users ask for different things.

Your job in the main thread is to: respond to users, mediate, coordinate, and summarize agent results. Keep responses SHORT — the terminal is shared.

Prefix user messages with their name when responding. Be fast, casual, and autonomous.

You are a MEDIATOR, not just a task executor. When users make conflicting requests, flag the conflict and help them align before proceeding — don't silently serve both.

When one user makes a decision that affects the group, surface it so others are aware.

Push back on requests that conflict with the group's goals or another user's in-progress work.

Prioritize coherence over speed — it's better to ask 'does everyone agree?' than to ship conflicting changes.

Help the group stay coordinated: track who's working on what and prevent people from stepping on each other's toes.`

type SessionSnapshot = {
  sandboxId: string
  wsUrl: string
  httpUrl: string
  startedAt: number
  status: "running"
}

const RELAY_PACKAGE = JSON.stringify(
  {
    name: "e2b-pty-relay",
    private: true,
    type: "module",
    dependencies: {
      elysia: "^1.4.0",
    },
  },
  null,
  2
)

const RELAY_SOURCE = String.raw`import { Elysia } from "elysia"

const port = Number(Bun.env.RELAY_PORT ?? "8080")
const cols = Number(Bun.env.INITIAL_COLS ?? "120")
const rows = Number(Bun.env.INITIAL_ROWS ?? "32")

const history = []
const users = new Map()
const clients = new Set()
let exited = false
let exitCode = null

function normalizeOutput(data) {
  if (typeof data === "string") return data
  if (data instanceof Uint8Array) return Buffer.from(data).toString("utf8")
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return data.toString("utf8")
  return String(data)
}

function remember(message) {
  history.push(message)
  if (history.length > 400) history.shift()
}

function broadcast(payload) {
  const message = JSON.stringify(payload)
  remember(message)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

const claudePath = "/usr/local/bin/claude"
const systemPrompt = Bun.env.CLAUDE_SYSTEM_PROMPT || ""
const claudeArgs = ["--dangerously-skip-permissions"]
if (systemPrompt) claudeArgs.push("--append-system-prompt", systemPrompt)

const proc = Bun.spawn([claudePath, ...claudeArgs], {
  cwd: "/home/user",
  env: {
    ...process.env,
    TERM: "xterm-256color",
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
  },
  terminal: {
    cols,
    rows,
    data(_terminal, data) {
      broadcast({ type: "output", data: normalizeOutput(data) })
    },
  },
})

setTimeout(() => { if (!exited) proc.terminal.write("\r") }, 3000)
setTimeout(() => { if (!exited) proc.terminal.write("\r") }, 5000)

proc.exited.then((code) => {
  exited = true
  exitCode = code
  broadcast({ type: "exit", code })
})

const app = new Elysia()
  .get("/healthz", ({ set }) => {
    set.status = exited ? 503 : 200
    return {
      ok: !exited,
      exited,
      exitCode,
    }
  })
  .ws("/ws", {
    open(ws) {
      // Don't add to clients yet — wait for "join" message
    },
    message(ws, rawMessage) {
      let message = rawMessage
      if (typeof rawMessage === "string") {
        try {
          message = JSON.parse(rawMessage)
        } catch {
          return
        }
      }

      if (!message || typeof message !== "object") {
        return
      }

      if (message.type === "join") {
        const name = String(message.name || "anon")
        users.set(ws, { name, joinedAt: Date.now() })
        clients.add(ws)
        for (const msg of history) {
          ws.send(msg)
        }
        ws.send(JSON.stringify({ type: "status", status: exited ? "exited" : "running" }))
        broadcast({ type: "users", users: [...users.values()] })
        broadcast({ type: "system", text: name + " joined" })
        return
      }

      if (message.type === "input" && !exited) {
        const name = String(message.name || "anon")
        const data = String(message.data ?? "")
        proc.terminal.write("[" + name + "]: " + data + "\r")
        broadcast({ type: "chat", name, text: data })
        return
      }

      if (message.type === "direct-input" && !exited) {
        proc.terminal.write(String(message.data ?? "") + "\r")
        return
      }

      if (message.type === "key" && !exited) {
        proc.terminal.write(String(message.data ?? ""))
        return
      }

      if (message.type === "resize" && !exited) {
        const nextCols = Math.max(20, Number(message.cols ?? cols))
        const nextRows = Math.max(8, Number(message.rows ?? rows))
        proc.terminal.resize(nextCols, nextRows)
        return
      }

      if (message.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }))
      }
    },
    close(ws) {
      const user = users.get(ws)
      users.delete(ws)
      clients.delete(ws)
      if (user) {
        broadcast({ type: "system", text: user.name + " left" })
        broadcast({ type: "users", users: [...users.values()] })
      }
    },
  })
  .listen(port)

function shutdown() {
  try {
    proc.kill()
  } catch {}
  try {
    proc.terminal.close()
  } catch {}
  try {
    app.stop()
  } catch {}
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)`

function getApiKey() {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey) {
    throw new Error("Missing E2B_API_KEY in apps/web/.env.local")
  }
  return apiKey
}

function getHttpUrl(sandbox: Sandbox) {
  return `https://${sandbox.getHost(RELAY_PORT)}`
}

function getWsUrl(sandbox: Sandbox) {
  return `wss://${sandbox.getHost(RELAY_PORT)}/ws`
}

async function isRelayHealthy(httpUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  try {
    const response = await fetch(`${httpUrl}/healthz`, {
      cache: "no-store",
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForRelay(httpUrl: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isRelayHealthy(httpUrl)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error("Timed out waiting for the Bun PTY relay")
}

async function installBun(sandbox: Sandbox) {
  await sandbox.commands.run(
    [
      "export BUN_INSTALL=\"$HOME/.bun\"",
      "export PATH=\"$BUN_INSTALL/bin:$PATH\"",
      "if [ ! -x \"$BUN_INSTALL/bin/bun\" ]; then",
      "  curl -fsSL https://bun.sh/install | bash",
      "fi",
    ].join("\n")
  )
}

async function installClaudeCode(sandbox: Sandbox) {
  await sandbox.commands.run(
    [
      "export NPM_CONFIG_PREFIX=\"$HOME/.npm-global\"",
      "export PATH=\"$NPM_CONFIG_PREFIX/bin:$PATH\"",
      "if ! command -v claude >/dev/null 2>&1; then",
      "  npm install -g @anthropic-ai/claude-code",
      "fi",
    ].join("\n")
  )
}

async function startRelay(sandbox: Sandbox, cols: number, rows: number) {
  await sandbox.commands.run(`mkdir -p "${RELAY_DIR}"`)

  await sandbox.files.write(RELAY_PACKAGE_PATH, RELAY_PACKAGE)
  await sandbox.files.write(RELAY_PATH, RELAY_SOURCE)
  await sandbox.files.write(RELAY_LOG_PATH, "")

  await installBun(sandbox)
  await installClaudeCode(sandbox)

  await sandbox.commands.run(
    [
      "export BUN_INSTALL=\"$HOME/.bun\"",
      "export PATH=\"$BUN_INSTALL/bin:$PATH\"",
      `cd "${RELAY_DIR}"`,
      "if [ ! -d node_modules/elysia ]; then",
      "  bun install",
      "fi",
    ].join("\n")
  )

  await sandbox.commands.run(
    [
      `if [ -f "${RELAY_PID_PATH}" ]; then`,
      `  kill "$(cat "${RELAY_PID_PATH}")" || true`,
      `  rm -f "${RELAY_PID_PATH}"`,
      "fi",
    ].join("\n")
  )

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ""
  const promptB64 = Buffer.from(SYSTEM_PROMPT).toString("base64")

  await sandbox.commands.run(
    [
      "export BUN_INSTALL=\"$HOME/.bun\"",
      "export PATH=\"$HOME/.npm-global/bin:$BUN_INSTALL/bin:$PATH\"",
      `export RELAY_PORT="${RELAY_PORT}"`,
      `export INITIAL_COLS="${cols}"`,
      `export INITIAL_ROWS="${rows}"`,
      `export ANTHROPIC_API_KEY="${apiKey}"`,
      `export CLAUDE_SYSTEM_PROMPT="$(echo '${promptB64}' | base64 -d)"`,
      `cd "${RELAY_DIR}"`,
      `echo $$ > "${RELAY_PID_PATH}"`,
      `exec bun ${RELAY_PATH} >> "${RELAY_LOG_PATH}" 2>&1`,
    ].join("\n"),
    { background: true, cwd: "/home/user" }
  )
}

async function ensureRelay(sandbox: Sandbox, cols: number, rows: number) {
  const httpUrl = getHttpUrl(sandbox)

  if (await isRelayHealthy(httpUrl)) {
    return
  }

  await startRelay(sandbox, cols, rows)

  try {
    await waitForRelay(httpUrl)
  } catch (error) {
    let logTail = ""
    try {
      const log = await sandbox.files.read(RELAY_LOG_PATH)
      logTail = String(log).slice(-4000)
    } catch {
      logTail = ""
    }

    throw new Error(
      logTail
        ? `Timed out waiting for relay. Last log output:\n${logTail}`
        : error instanceof Error
          ? error.message
          : "Timed out waiting for relay"
    )
  }
}

export async function createOrConnectSession(
  sandboxId: string | undefined,
  cols: number,
  rows: number
): Promise<SessionSnapshot> {
  const sandbox = sandboxId
    ? await Sandbox.connect(sandboxId, {
        apiKey: getApiKey(),
        timeoutMs: SANDBOX_TIMEOUT_MS,
      })
    : await Sandbox.create({
        apiKey: getApiKey(),
        metadata: {
          app: "jam-next",
          runtime: "bun-pty-relay",
        },
        network: {
          allowPublicTraffic: true,
        },
        timeoutMs: SANDBOX_TIMEOUT_MS,
      })

  await sandbox.setTimeout(SANDBOX_TIMEOUT_MS)
  await ensureRelay(sandbox, cols, rows)

  return {
    sandboxId: sandbox.sandboxId,
    wsUrl: getWsUrl(sandbox),
    httpUrl: getHttpUrl(sandbox),
    startedAt: Date.now(),
    status: "running",
  }
}

export async function destroySession(sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId, {
    apiKey: getApiKey(),
    timeoutMs: 30_000,
  })
  await sandbox.kill()
}

export async function readSandboxLogs(sandboxId: string): Promise<string> {
  const sandbox = await Sandbox.connect(sandboxId, {
    apiKey: getApiKey(),
    timeoutMs: 10_000,
  })
  try {
    const log = await sandbox.files.read(RELAY_LOG_PATH)
    return String(log).slice(-8000)
  } catch {
    return "(no logs found)"
  }
}
