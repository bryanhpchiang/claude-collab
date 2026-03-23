# Jam — Multiplayer Claude Code

A web-based multiplayer interface for Claude Code. Multiple users connect through a browser, share a terminal view of a running Claude Code process, and send messages to it collaboratively. Think "Google Docs, but for a Claude CLI session."

Live at **letsjam.now**.

## Quick Start

```bash
# Install dependencies
bun install

# Run the server
bun run server.ts
```

The server starts on **port 7681**. No build step required — `server.ts` runs directly with Bun and `public/index.html` is served as a static file.

## How It Works

```
Browser (xterm.js) ←— WebSocket —→ Bun Server ←— PTY —→ Claude Code CLI
```

1. The Bun server spawns Claude Code CLI processes via `bun-pty`, one per session.
2. Browser clients connect over WebSocket and render terminal output with xterm.js.
3. User messages are sent via WebSocket and written into the Claude PTY as `[username]: message`.
4. Claude's output is broadcast to all clients in the session.

## Features

- **Multi-session** — Create and switch between independent Claude sessions, each with its own PTY process and chat history.
- **Session resumption** — Resume previous Claude Code sessions from disk.
- **Collaborative input** — All connected users can send messages and interact with Claude simultaneously.
- **Terminal + chat** — Full terminal view alongside a chat panel for user messages and system events.
- **Image paste** — Paste images directly into the input to upload and share with Claude.
- **Key buttons** — Send raw keypresses (Enter, Esc, Ctrl+C, etc.) to interact with Claude prompts.

## Key Files

| File | Purpose |
|---|---|
| `server.ts` | Bun HTTP + WebSocket server. Spawns Claude PTY processes, manages sessions, handles uploads, serves the frontend. |
| `public/index.html` | Single-file frontend (HTML + CSS + JS). Full UI: session tabs, xterm.js terminal, chat panel, input area. |
| `package.json` | Dependencies and start script. |
| `CLAUDE.md` | Detailed project guide and architecture docs. |

## Dependencies

- [Bun](https://bun.sh) — JavaScript runtime and server
- [bun-pty](https://github.com/nicolo-ribaudo/bun-pty) — PTY bindings for spawning Claude processes
- [xterm.js](https://xtermjs.org) (CDN) — Terminal emulator in the browser
