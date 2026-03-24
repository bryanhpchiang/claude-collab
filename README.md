# Jam — Multiplayer Claude Code

A web-based multiplayer interface for Claude Code. Multiple users connect through a browser, share a terminal view of a running Claude Code process, and send messages to it collaboratively. Think "Google Docs, but for a Claude CLI session."

Live at **letsjam.now**.

## Quick Start

```bash
# Install workspace dependencies
bun install

# Run the jam runtime server
bun run runtime:start

# Run the coordination server
bun run coordination:start
```

The jam runtime server starts on **port 7681**. The coordination server runs from [`packages/coordination`](/Users/sofiane/Documents/claude-collab/packages/coordination) on **port 8080** by default.

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

## Workspace Layout

| Path | Purpose |
|---|---|
| `packages/runtime/src/index.ts` | Jam runtime entrypoint. Boots the Bun server and WebSocket handlers. |
| `packages/runtime/src/server` | Runtime server modules for sessions, projects, secrets, system routes, and static asset serving. |
| `packages/runtime/src/web` | Runtime browser client source: HTML shell, browser modules, and CSS. |
| `packages/coordination/src/index.ts` | Coordination server entrypoint. Handles auth, jam lifecycle APIs, HTML pages, and static assets. |
| `packages/coordination/src/routes` | Coordination route handlers split by auth, jams, and pages. |
| `packages/coordination/src/services` | AWS, DynamoDB, GitHub OAuth, and EC2 user-data logic. |
| `packages/coordination/src/views` | Server-rendered landing/dashboard HTML plus reusable view components. |
| `CLAUDE.md` | Detailed project guide and architecture docs. |

## Dependencies

- [Bun](https://bun.sh) — JavaScript runtime and server
- [bun-pty](https://github.com/nicolo-ribaudo/bun-pty) — PTY bindings for spawning Claude processes
- [xterm.js](https://xtermjs.org) (CDN) — Terminal emulator in the browser
