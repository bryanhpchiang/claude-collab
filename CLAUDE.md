# Jam — Multiplayer Claude Code

A web-based multiplayer interface for Claude Code. Multiple users connect through a browser, share a terminal view of a running Claude Code process, and send messages to it collaboratively. Think "Google Docs, but for a Claude CLI session." Live at **letsjam.now**.

## Quick Start

```bash
# Install dependencies (if needed)
~/.bun/bin/bun install

# Run the server
~/.bun/bin/bun run server.ts
```

The server starts on **port 7681**. Access the UI at `http://localhost:7681` (or via the exe.dev HTTPS proxy).

There is no build step required for development -- `server.ts` runs directly with Bun and `public/index.html` is served as a static file. The `dist/` directory contains a pre-built `server.js` but is not used during development.

## Architecture

### How it works

1. The **Bun server** (`server.ts`) spawns Claude Code CLI processes using `bun-pty` (a pseudo-terminal library), one per session.
2. The **browser client** (`public/index.html`) connects over WebSocket and renders the Claude terminal output using xterm.js.
3. When a user types a message, it is sent via WebSocket to the server, which writes `[username]: message` into the Claude PTY's stdin.
4. Claude's terminal output is broadcast to all clients subscribed to that session.

### Data flow

```
Browser (xterm.js) <--WebSocket--> Bun Server <--PTY--> Claude Code CLI
```

### Multi-session model

- The server maintains a `Map<string, Session>` of active sessions in memory.
- Each session has its own Claude Code PTY process, scrollback buffer, and chat history.
- Clients subscribe to a session via WebSocket pub/sub (`server.publish` / `ws.subscribe`).
- A "lobby" channel broadcasts the session list to all connected clients.
- Sessions can be created fresh or resumed from Claude Code's on-disk session files (`~/.claude/projects/.../*.jsonl`).

### WebSocket message types

**Client -> Server:**
- `join-session` -- join/switch to a session (includes `sessionId` and `name`)
- `input` -- send a text message to Claude (written to PTY as `[name]: text`)
- `key` -- send a raw keypress sequence to the PTY (Enter, Esc, Ctrl+C, etc.)

**Server -> Client:**
- `sessions` -- updated session list (broadcast on lobby channel)
- `output` -- raw terminal data from Claude's PTY
- `chat` -- a user's chat message (for the chat panel)
- `system` -- system notification (user joined/left, process exited)
- `users` -- list of users in the current session

## Key Files

| File | Purpose |
|---|---|
| `server.ts` | Bun HTTP + WebSocket server. Spawns Claude Code PTY processes, manages sessions, handles file uploads, serves the frontend. ~340 lines. |
| `public/index.html` | Single-file frontend (HTML + CSS + JS). Contains the full UI: name modal, session tabs, xterm.js terminal, chat panel, key buttons. ~600 lines. |
| `package.json` | Dependencies: `bun-pty`, `node-pty`, `@anthropic-ai/sdk`. Start script: `bun run server.ts`. |
| `dist/server.js` | Pre-built server bundle. Not used in dev. |
| `CLAUDE.md` | This file. Project guide and Claude session instructions. |

## Key Dependencies

- **Bun** (`~/.bun/bin/bun`) -- JavaScript runtime, used as the server
- **bun-pty** -- PTY (pseudo-terminal) bindings for Bun, used to spawn and control Claude Code processes
- **xterm.js** (CDN) -- Terminal emulator in the browser, renders Claude's output
- **xterm addon-fit** (CDN) -- Auto-sizes the terminal to fit its container

## Server Details (`server.ts`)

### HTTP routes
- `GET /` -- serves `public/index.html`
- `GET /api/sessions` -- returns active session list
- `POST /api/sessions` -- creates a new session (body: `{ name, resumeId? }`)
- `PATCH /api/sessions` -- renames a session (body: `{ id, name }`)
- `GET /api/disk-sessions` -- scans `~/.claude/projects/` for resumable Claude sessions
- `POST /api/upload-image` -- uploads an image to `/tmp/claude-uploads/`, returns the file path

### Claude process spawning
- Claude binary path: found via `which claude`
- Always runs with `--dangerously-skip-permissions`
- Uses `--append-system-prompt` to inject the multiplayer system prompt
- Resumes existing sessions with `--resume <sessionId>`
- Sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to enable parallel agent execution
- Working directory: `process.cwd()` (defaults to repo root)
- Auto-sends Enter after 3s and 5s to dismiss the trust prompt

### Session management
- Sessions are in-memory only (lost on server restart, though Claude sessions persist on disk and can be resumed)
- Scrollback buffer is capped at 200k chars (trimmed to last 100k)
- Chat history is capped at 200 messages per session
- A default "General" session is created on startup

## Frontend Details (`public/index.html`)

Single-file architecture -- all HTML, CSS, and JS in one file. No build tools, no framework.

### UI components
- **Name modal** -- shown on first visit; name persists in `localStorage`
- **Session bar** -- tabs for each session with user count badges; double-click to rename
- **Terminal** -- xterm.js instance with smart auto-scroll (pauses if user scrolls up, resumes after 10s or on new output near bottom)
- **Chat panel** -- collapsible panel below terminal; shows user messages and system events; unread badge when collapsed
- **Key bar** -- buttons for sending raw keys (Enter, Esc, Tab, Ctrl+C, arrow keys, y/n) useful for interacting with Claude prompts
- **Input area** -- text input with click-to-edit username tag; supports image paste (uploads to server, inserts file path)

### Design
- GitHub-dark color scheme (`#0d1117` background, `#e6edf3` text)
- Warm orange/red gradient branding ("Jam")
- User colors are deterministically assigned from a fixed palette based on name hash

## Environment

- **VM**: exe.dev persistent instance (`dog-tare`)
- **Working directory**: repo root (wherever server.ts is run from)
- **Runtime**: Bun (at `~/.bun/bin/bun`)
- **Permissions**: Running with `--dangerously-skip-permissions`
- **GitHub**: Authenticated as `bryanhpchiang`

## Coding Conventions

- **TypeScript** for the server, plain **JavaScript** in the HTML file
- No framework or bundler for the frontend -- everything is in a single HTML file with inline `<style>` and `<script>` tags
- CDN-loaded dependencies for the frontend (xterm.js)
- Compact, terse code style -- short variable names, chained expressions, minimal whitespace
- Interfaces defined inline in `server.ts` (e.g., `Session`, `DiskSession`)
- Bun-native APIs preferred (`Bun.serve`, `Bun.file`, `Bun.write`)
- Error handling via empty `catch {}` blocks (fail silently, keep going)
- No logging framework -- plain `console.log`

## Gotchas and Important Notes

- The server must be restarted if `server.ts` changes. There is no hot-reload.
- `bun-pty` is a native module -- if Bun is updated, you may need to reinstall deps.
- The trust prompt auto-dismiss (sending Enter at 3s and 5s) is timing-dependent and may occasionally fail on slow starts.
- Session state is in-memory. A server restart kills all active sessions. Users can resume Claude sessions from disk via the "New Session" menu.
- The `dist/server.js` build is not automatically regenerated. It can get stale.
- Image uploads go to `/tmp/claude-uploads/` which is ephemeral.
- The frontend uses `disableStdin: true` on xterm -- users cannot type directly into the terminal. All input goes through the chat input or key buttons.
- WebSocket reconnects automatically after 2 seconds on disconnect.

---

## Multiplayer Session Instructions

You are running in a **shared multiplayer session**. Multiple users are connected via the web UI and sending you messages through a shared terminal. Each message arrives as `[username]: message`.

### Key behaviors

- **Use Agent subagents aggressively.** Spawn agents in parallel for independent tasks so you stay responsive to new user messages while work happens in the background. Use `run_in_background: true` whenever possible.
- When a user asks you to do something, immediately spawn an agent for it and acknowledge -- do not block the conversation doing long tasks inline.
- If multiple users ask for different things, launch agents for each in parallel.
- Keep your direct responses SHORT. The terminal is shared -- do not flood it with walls of text.
- Address users by name when they include it in their message.
- If someone asks a question while agents are working, answer it -- do not wait for agents to finish.

### Mediator role

- You are a **mediator**, not just a task executor.
- When users make conflicting requests, flag the conflict and help them align before proceeding.
- When one user makes a decision that affects the group, surface it so others are aware.
- Push back on requests that conflict with the group's goals or another user's in-progress work.
- Prioritize coherence over speed -- it is better to ask "does everyone agree?" than to ship conflicting changes.
- Track who is working on what and prevent people from stepping on each other's toes.

### Style

- Be casual, direct, and fast
- Do not ask for confirmation -- just do it
- Use agents for anything that takes more than a few seconds
