"use client"

import { useEffect, useEffectEvent, useRef, useState, startTransition } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Power,
  RefreshCw,
  Send,
  Users,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SessionStatus = "running" | "closed" | "error"

type Session = {
  sandboxId: string
  wsUrl: string
  httpUrl: string
  startedAt: number
  status: SessionStatus
}

type ConnectedUser = { name: string; joinedAt: number }

type ChatEntry =
  | { kind: "chat"; name: string; text: string }
  | { kind: "system"; text: string }

type RelayMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code: number }
  | { type: "status"; status: "running" | "exited" }
  | { type: "users"; users: ConnectedUser[] }
  | { type: "chat"; name: string; text: string }
  | { type: "system"; text: string }
  | { type: "pong" }

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "jam-next-e2b-session"
const NAME_KEY = "jam-username"

const USER_COLORS = ["#22d3ee", "#facc15", "#e879f9", "#60a5fa", "#4ade80"]

function getUserColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

const DISABLE_MOUSE_SEQUENCES =
  "\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1005l\u001b[?1006l\u001b[?1015l"

const MOUSE_ENABLE_RE = /\u001b\[\?(1000|1002|1003|1005|1006|1015)h/g

const KEY_BUTTONS = [
  { label: "Enter", seq: "\r" },
  { label: "Esc", seq: "\x1b" },
  { label: "Tab", seq: "\t" },
  { label: "Ctrl+C", seq: "\x03" },
  { label: "y", seq: "y" },
  { label: "n", seq: "n" },
  { label: "\u2191", seq: "\x1b[A" },
  { label: "\u2193", seq: "\x1b[B" },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function postJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  })
  const json = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(json.error ?? "Request failed")
  return json
}

/* ------------------------------------------------------------------ */
/*  Jam Jar Animation (SVG + CSS)                                      */
/* ------------------------------------------------------------------ */

function JamJarAnimation() {
  return (
    <div className="relative mx-auto mb-6 size-32">
      <svg viewBox="0 0 128 128" className="size-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="lid-grad" x1="30" y1="16" x2="98" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E8A838" />
            <stop offset="1" stopColor="#D4872C" />
          </linearGradient>
          <linearGradient id="jam-grad" x1="64" y1="60" x2="64" y2="120" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A855F7" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>

        {/* Jar body */}
        <path d="M32 40c-4 0-8 4-8 8v40c0 16 12 28 28 28h24c16 0 28-12 28-28V48c0-4-4-8-8-8H32z" fill="#1E1832" />

        {/* Jam fill with wave animation */}
        <g className="animate-jam-wave">
          <path d="M24 72c4-4 16-8 28-6s22 6 28 4 18-6 28-4v26c0 16-12 28-28 28H52c-16 0-28-12-28-28V72z" fill="url(#jam-grad)" opacity="0.65" />
        </g>

        {/* Jam spill blob — animated */}
        <g className="animate-jam-spill">
          <ellipse cx="96" cy="42" rx="8" ry="12" fill="#A855F7" opacity="0.5" />
          <ellipse cx="100" cy="56" rx="5" ry="5" fill="#7C3AED" opacity="0.35" />
        </g>

        {/* Lid */}
        <rect x="30" y="16" width="68" height="12" rx="6" fill="url(#lid-grad)" />
        <path d="M26 28h76v6c0 2-6 6-12 6H38c-6 0-12-4-12-6v-6z" fill="url(#lid-grad)" opacity="0.8" />

        {/* Drip drops */}
        <circle cx="22" cy="108" r="4" fill="#A855F7" opacity="0.4" className="animate-jam-drip" />
        <circle cx="110" cy="112" r="3" fill="#7C3AED" opacity="0.35" className="animate-jam-drip-delayed" />
      </svg>

      <style>{`
        @keyframes jam-wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes jam-spill {
          0% { transform: translateY(0) scaleY(0.3); opacity: 0; }
          20% { transform: translateY(-8px) scaleY(1); opacity: 1; }
          50% { transform: translateY(4px) scaleY(0.8); opacity: 0.7; }
          80% { transform: translateY(-2px) scaleY(0.5); opacity: 0.3; }
          100% { transform: translateY(0) scaleY(0.3); opacity: 0; }
        }
        @keyframes jam-drip {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(6px); opacity: 0.15; }
        }
        .animate-jam-wave { animation: jam-wave 3s ease-in-out infinite; transform-origin: center; }
        .animate-jam-spill { animation: jam-spill 4s ease-in-out infinite; transform-origin: 96px 42px; }
        .animate-jam-drip { animation: jam-drip 2.5s ease-in-out infinite; }
        .animate-jam-drip-delayed { animation: jam-drip 2.5s ease-in-out infinite 1.2s; }
      `}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Name Modal                                                         */
/* ------------------------------------------------------------------ */

function NameModal({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[rgba(168,85,247,0.2)] bg-[#110E1A] p-8 shadow-2xl">
        <JamJarAnimation />

        <h1 className="mb-1 text-center font-brand text-3xl font-bold" style={{ background: "linear-gradient(135deg, #E8A838, #D4872C)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Jam
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Multiplayer Claude Code</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = value.trim()
            if (trimmed) onSubmit(trimmed)
          }}
        >
          <label className="mb-2 block text-xs font-medium text-muted-foreground">What&apos;s your name?</label>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter your name..."
            className="mb-4 w-full rounded-lg border border-[rgba(168,85,247,0.2)] bg-[#0C0A14] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="submit" className="w-full" size="lg" disabled={!value.trim()}>
            Join
          </Button>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function TerminalWorkspace() {
  const terminalViewportRef = useRef<HTMLDivElement | null>(null)
  const terminalElementRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTerminalSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const selectionModeRef = useRef(false)
  const chatLogRef = useRef<HTMLDivElement | null>(null)
  const messageInputRef = useRef<HTMLInputElement | null>(null)
  const userNameRef = useRef<string | null>(null)

  const [userName, setUserName] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([])
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([])
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)
  const [message, setMessage] = useState("")

  const terminalReady = Boolean(session && session.status === "running")

  // Init name from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(NAME_KEY)
    if (stored) {
      setUserName(stored)
      userNameRef.current = stored
    }
  }, [])

  function handleNameSubmit(name: string) {
    localStorage.setItem(NAME_KEY, name)
    setUserName(name)
    userNameRef.current = name
  }

  // Auto-scroll chat
  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight })
  }, [chatEntries])

  function appendChat(entry: ChatEntry) {
    setChatEntries((prev) => [...prev, entry])
    if (chatCollapsed) setChatUnread((n) => n + 1)
  }

  /* ---- session lifecycle ---- */

  function handleStatus(nextSession: Session | null) {
    sessionRef.current = nextSession
    startTransition(() => {
      setSession(nextSession)
      setLastError(nextSession?.status === "error" ? "Terminal relay failed" : null)
    })
    if (nextSession) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession))
    else sessionStorage.removeItem(STORAGE_KEY)
  }

  function connectSocket(nextSession: Session) {
    socketRef.current?.close()
    const socket = new WebSocket(nextSession.wsUrl)

    socket.onopen = () => {
      setIsLaunching(false)
      handleStatus({ ...nextSession, status: "running" })
      window.requestAnimationFrame(() => syncTerminalSize())

      // Send join with username
      const name = userNameRef.current
      if (name) socket.send(JSON.stringify({ type: "join", name }))

      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }))
      }, 15_000)
    }

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data as string) as RelayMessage

      switch (payload.type) {
        case "output":
          terminalRef.current?.write(
            selectionModeRef.current ? payload.data.replace(MOUSE_ENABLE_RE, "") : payload.data
          )
          break
        case "exit":
          terminalRef.current?.writeln(`\r\n\u001b[2mClaude exited with code ${payload.code}.\u001b[0m`)
          if (sessionRef.current) handleStatus({ ...sessionRef.current, status: "closed" })
          break
        case "users":
          setConnectedUsers(payload.users)
          break
        case "chat":
          appendChat({ kind: "chat", name: payload.name, text: payload.text })
          break
        case "system":
          appendChat({ kind: "system", text: payload.text })
          break
        case "pong":
          break
      }
    }

    socket.onerror = () => setLastError("WebSocket connection failed")

    socket.onclose = () => {
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null }
      const current = sessionRef.current
      if (current?.sandboxId === nextSession.sandboxId && current.status === "running") {
        appendChat({ kind: "system", text: "Connection lost, reconnecting..." })
        setTimeout(() => {
          if (sessionRef.current?.sandboxId === nextSession.sandboxId) connectSocket(nextSession)
        }, 1500)
      }
    }

    socketRef.current = socket
  }

  function syncTerminalSize() {
    const fitAddon = fitAddonRef.current
    const terminal = terminalRef.current
    if (!fitAddon || !terminal) return
    fitAddon.fit()
    const next = { cols: terminal.cols, rows: terminal.rows }
    if (lastTerminalSizeRef.current?.cols === next.cols && lastTerminalSizeRef.current?.rows === next.rows) return
    lastTerminalSizeRef.current = next
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", cols: next.cols, rows: next.rows }))
    }
  }

  const scheduleResizeSync = useEffectEvent(() => {
    if (resizeFrameRef.current !== null) return
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null
      syncTerminalSize()
    })
  })

  async function shutdownSession() {
    const cur = sessionRef.current
    if (!cur) return
    try {
      handleStatus({ ...cur, status: "closed" })
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null }
      socketRef.current?.close(); socketRef.current = null
      await postJson("/api/terminal/session", { method: "DELETE", body: JSON.stringify({ sandboxId: cur.sandboxId }) })
      handleStatus(null)
      appendChat({ kind: "system", text: "Sandbox terminated." })
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Failed to shutdown")
    }
  }

  async function launchSession(mode: "new" | "resume") {
    if (isLaunching) return
    setLastError(null)
    setIsLaunching(true)

    if (mode === "new") {
      if (sessionRef.current) await shutdownSession()
      terminalRef.current?.clear()
      terminalRef.current?.writeln("\u001b[1mLaunching Claude Code in E2B sandbox...\u001b[0m\r\n")
    } else {
      terminalRef.current?.writeln("\r\n\u001b[2mReconnecting...\u001b[0m")
    }

    try {
      const stored = mode === "resume" ? (JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Session | null) : null
      const terminal = terminalRef.current
      const nextSession = await postJson<Session>("/api/terminal/session", {
        method: "POST",
        body: JSON.stringify({ sandboxId: stored?.sandboxId, cols: terminal?.cols ?? 120, rows: terminal?.rows ?? 32 }),
      })
      handleStatus(nextSession)
      connectSocket(nextSession)
    } catch (error) {
      setIsLaunching(false)
      setLastError(error instanceof Error ? error.message : "Failed to launch sandbox")
    }
  }

  const resumeStoredSession = useEffectEvent(() => { void launchSession("resume") })

  /* ---- input handling ---- */

  function sendChatMessage(direct = false) {
    const text = message.trim()
    if (!text) return
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    if (direct) {
      socket.send(JSON.stringify({ type: "direct-input", data: text }))
    } else {
      socket.send(JSON.stringify({ type: "input", data: text, name: userNameRef.current }))
    }
    setMessage("")
    messageInputRef.current?.focus()
  }

  function sendKey(seq: string) {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: "key", data: seq }))
  }

  const sendTerminalInput = useEffectEvent((data: string) => {
    const socket = socketRef.current
    if (selectionModeRef.current || !socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: "input", data, name: userNameRef.current }))
  })

  /* ---- clipboard ---- */

  const isTerminalFocused = useEffectEvent(() => {
    const terminal = terminalRef.current
    const el = document.activeElement
    return Boolean(terminal?.textarea && el && (el === terminal.textarea || terminalElementRef.current?.contains(el)))
  })

  const copySelection = useEffectEvent(async () => {
    const t = terminalRef.current
    if (!t?.hasSelection()) return false
    try { await navigator.clipboard.writeText(t.getSelection() || ""); return true } catch { return false }
  })

  const pasteClipboard = useEffectEvent(async () => {
    try { const t = await navigator.clipboard.readText(); if (t) sendTerminalInput(t); return true } catch { return false }
  })

  const handleClipboardShortcut = useEffectEvent((event: KeyboardEvent) => {
    const terminal = terminalRef.current
    if (!terminal) return true
    const key = event.key.toLowerCase()
    const isMac = navigator.platform.toLowerCase().includes("mac")
    const copy = (isMac && event.metaKey && !event.ctrlKey && key === "c") || (!isMac && event.ctrlKey && event.shiftKey && key === "c")
    const paste = (isMac && event.metaKey && !event.ctrlKey && key === "v") || (!isMac && event.ctrlKey && event.shiftKey && key === "v") || (!isMac && event.shiftKey && key === "insert")
    if (copy && terminal.hasSelection()) { event.preventDefault(); event.stopPropagation(); void copySelection(); return false }
    if (paste) { event.preventDefault(); event.stopPropagation(); void pasteClipboard(); return false }
    return true
  })

  /* ---- terminal setup ---- */

  useEffect(() => {
    const el = terminalElementRef.current
    const terminal = new Terminal({
      allowProposedApi: false, convertEol: true, cursorBlink: true,
      disableStdin: selectionModeRef.current,
      fontFamily: "var(--font-mono), 'SF Mono', Consolas, 'Liberation Mono', monospace",
      fontSize: 14, letterSpacing: 0, lineHeight: 1, scrollback: 5000,
      allowTransparency: false, macOptionClickForcesSelection: true, rightClickSelectsWord: true,
      theme: {
        background: "#0C0A14", foreground: "#E8E2F4", cursor: "#E8A838", cursorAccent: "#0C0A14",
        selectionBackground: "rgba(168, 85, 247, 0.25)",
        black: "#110E1A", blue: "#60a5fa", brightBlack: "#525252", brightBlue: "#93c5fd",
        brightCyan: "#67e8f9", brightGreen: "#86efac", brightMagenta: "#f0abfc",
        brightRed: "#fca5a5", brightWhite: "#E8E2F4", brightYellow: "#fde68a",
        cyan: "#22d3ee", green: "#4ade80", magenta: "#e879f9",
        red: "#f87171", white: "#e5e5e5", yellow: "#facc15",
      },
    })

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminalRef.current = terminal
    terminal.loadAddon(fitAddon)
    terminal.attachCustomKeyEventHandler((e) => e.type !== "keydown" ? true : handleClipboardShortcut(e))

    if (el) {
      terminal.open(el)
      fitAddon.fit()
      if (!selectionModeRef.current) terminal.focus()
    }

    const dataD = terminal.onData((d) => sendTerminalInput(d))
    const binD = terminal.onBinary((d) => sendTerminalInput(d))
    const textarea = terminal.textarea

    const copyL = (e: ClipboardEvent) => { if (terminal.hasSelection()) { e.preventDefault(); e.clipboardData?.setData("text/plain", terminal.getSelection() || "") } }
    const cutL = (e: ClipboardEvent) => { if (terminal.hasSelection()) { e.preventDefault(); e.clipboardData?.setData("text/plain", terminal.getSelection() || ""); terminal.clearSelection() } }
    const pasteL = async (e: ClipboardEvent) => { e.preventDefault(); const t = e.clipboardData?.getData("text/plain"); if (t) sendTerminalInput(t); else await pasteClipboard() }
    const keyL = (e: KeyboardEvent) => { if (isTerminalFocused() && !selectionModeRef.current) void handleClipboardShortcut(e) }
    const clickL = () => { if (!terminal.hasSelection() && !selectionModeRef.current) terminal.focus() }

    resizeObserverRef.current = new ResizeObserver(() => scheduleResizeSync())
    if (terminalViewportRef.current) resizeObserverRef.current.observe(terminalViewportRef.current)

    textarea?.addEventListener("copy", copyL); textarea?.addEventListener("cut", cutL)
    textarea?.addEventListener("paste", pasteL); textarea?.addEventListener("keydown", keyL, true)
    el?.addEventListener("paste", pasteL); el?.addEventListener("keydown", keyL, true); el?.addEventListener("click", clickL)
    window.addEventListener("keydown", keyL, true)

    if (sessionStorage.getItem(STORAGE_KEY)) queueMicrotask(() => resumeStoredSession())

    return () => {
      dataD.dispose(); binD.dispose()
      textarea?.removeEventListener("copy", copyL); textarea?.removeEventListener("cut", cutL)
      textarea?.removeEventListener("paste", pasteL); textarea?.removeEventListener("keydown", keyL, true)
      el?.removeEventListener("paste", pasteL); el?.removeEventListener("keydown", keyL, true); el?.removeEventListener("click", clickL)
      window.removeEventListener("keydown", keyL, true)
      socketRef.current?.close()
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current)
      resizeObserverRef.current?.disconnect()
      terminal.dispose(); terminalRef.current = null; fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    selectionModeRef.current = selectionMode
    const t = terminalRef.current
    if (t) { t.options.disableStdin = selectionMode; if (selectionMode) t.write(DISABLE_MOUSE_SEQUENCES) }
  }, [selectionMode])

  /* ---- render ---- */

  if (!userName) return <NameModal onSubmit={handleNameSubmit} />

  return (
    <main className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="font-brand text-xl font-bold" style={{ background: "linear-gradient(135deg, #E8A838, #D4872C)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Jam
          </h1>
          {connectedUsers.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {connectedUsers.map((u) => (
                <span key={u.name} className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ backgroundColor: getUserColor(u.name) }} />
                  {u.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => { void launchSession("new") }}
            disabled={isLaunching}
          >
            {isLaunching ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {isLaunching ? "Launching..." : "Launch"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { void launchSession("resume") }} disabled={isLaunching}>
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { void shutdownSession() }} disabled={!session}>
            <Power className="size-3.5" />
          </Button>
        </div>
      </header>

      {/* Terminal */}
      <div className="relative min-h-0 flex-1">
        <div ref={terminalViewportRef} className="absolute inset-0">
          <div ref={terminalElementRef} className="terminal-shell h-full w-full overflow-hidden" style={{ backgroundColor: "#0C0A14" }} />
        </div>
      </div>

      {/* Error bar */}
      {lastError && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {lastError}
        </div>
      )}

      {/* Key buttons */}
      {terminalReady && (
        <div className="flex items-center gap-1 border-t border-border px-4 py-1.5">
          {KEY_BUTTONS.map((k) => (
            <button
              key={k.label}
              onClick={() => sendKey(k.seq)}
              className="rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {k.label}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={() => setSelectionMode(!selectionMode)}
              className={cn(
                "rounded px-2 py-1 text-[11px] transition",
                selectionMode ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {selectionMode ? "Read Only" : "Direct Type"}
            </button>
          </div>
        </div>
      )}

      {/* Chat panel */}
      <div className="border-t border-border">
        <button
          onClick={() => { setChatCollapsed(!chatCollapsed); if (chatCollapsed) setChatUnread(0) }}
          className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            Chat
            {chatUnread > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {chatUnread}
              </span>
            )}
          </span>
          {chatCollapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>

        {!chatCollapsed && (
          <div className="border-t border-border">
            <div ref={chatLogRef} className="max-h-40 overflow-y-auto px-4 py-2 text-xs">
              {chatEntries.length === 0 && (
                <div className="text-muted-foreground">No messages yet.</div>
              )}
              {chatEntries.map((entry, i) =>
                entry.kind === "system" ? (
                  <div key={i} className="py-0.5 italic text-muted-foreground">{entry.text}</div>
                ) : (
                  <div key={i} className="py-0.5">
                    <span className="font-semibold" style={{ color: getUserColor(entry.name) }}>{entry.name}</span>
                    <span className="text-foreground">: {entry.text}</span>
                  </div>
                )
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border px-4 py-2">
              <span
                className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: getUserColor(userName) + "20", color: getUserColor(userName) }}
              >
                {userName}
              </span>
              <input
                ref={messageInputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(false) }
                  if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); sendChatMessage(true) }
                }}
                placeholder={terminalReady ? "Message Claude... (Shift+Enter = direct)" : "Launch a sandbox first"}
                disabled={!terminalReady}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <Button size="sm" variant="ghost" onClick={() => sendChatMessage(false)} disabled={!terminalReady || !message.trim()}>
                <Send className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
