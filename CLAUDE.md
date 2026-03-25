# Jam — Multiplayer Claude Code

A web-based multiplayer interface for Claude Code. Multiple users connect through a browser, share a terminal view of a running Claude Code process, and send messages to it collaboratively. Think "Google Docs, but for a Claude CLI session." Live at **letsjam.now**.

## Quick Start

```bash
# Install dependencies (if needed)
~/.bun/bin/bun install

# Run the server
~/.bun/bin/bun run runtime:start
```

The server starts on **port 7681**. Access the UI at `http://localhost:7681` (or via the exe.dev HTTPS proxy).

`packages/runtime/src/index.ts` still runs directly with Bun. The browser apps now live under `src/web` in each package and use React + TypeScript + Vite for hydration, client bundling, and frontend builds.

## Architecture

### How it works

1. The **Bun server** (`packages/runtime/src/index.ts` + `packages/runtime/src/server/*`) spawns Claude Code CLI processes using `bun-pty`, one per session.
2. The **browser client** (`packages/runtime/src/web/*`) connects over WebSocket and renders the Claude terminal output using xterm.js.
3. When a user types a message, it is sent via WebSocket to the server. Standard sends write `[username]: message` into the Claude PTY's stdin, while `Shift+Enter` sends the raw message text directly.
4. Claude's terminal output is broadcast to all clients subscribed to that session.

### Data flow

```
Browser (xterm.js) <--WebSocket--> Bun Server <--PTY--> Claude Code CLI
```

### Multi-session model

- Each runtime instance is one jam. Jam identity and `/j/:jamId` routing live in the coordination app, not in the runtime.
- The server maintains a `Map<string, Session>` of active sessions in memory.
- Each session has its own Claude Code PTY process, scrollback buffer, and chat history.
- Clients subscribe to a session via WebSocket pub/sub (`server.publish` / `ws.subscribe`).
- A "lobby" channel broadcasts the session list to all connected clients.
- Sessions can be created fresh or resumed from Claude Code's on-disk session files (`~/.claude/projects/.../*.jsonl`).

### WebSocket message types

**Client -> Server:**
- `join-session` -- join/switch to a session (includes `sessionId` and `name`)
- `input` -- send a text message to Claude (written to PTY as `[name]: text` by default, or raw text when `direct: true`)
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
| `packages/runtime/src/index.ts` | Runtime entrypoint. Boots Bun, the route handler, and the WebSocket handler. |
| `packages/runtime/src/server/runtime-store.ts` | Core runtime state and session/project lifecycle logic for a single jam instance. |
| `packages/runtime/src/server/routes` | HTTP route handlers split by projects, sessions, secrets, system, and static assets. |
| `packages/runtime/src/server/static-app.ts` | Runtime SSR shell that renders the React app and injects frontend assets. |
| `packages/runtime/src/web/main.client.tsx` | Runtime browser hydration entrypoint. |
| `packages/runtime/src/web/RuntimeApp.tsx` | Runtime React UI for the multiplayer terminal, chat, sessions, projects, and modals. |
| `packages/coordination/src/server/web-render.tsx` | Coordination SSR renderer for landing and dashboard pages. |
| `packages/coordination/src/web/App.tsx` | Coordination React app used for SSR and hydration. |
| `packages/runtime/package.json` | Runtime package manifest. Start script: `bun run src/index.ts`. |
| `packages/coordination/src/index.ts` | Coordination server entrypoint for auth, dashboard, and EC2 orchestration. |
| `packages/coordination/src/services/auth.ts` | Better Auth wiring for GitHub sign-in, session lookup, and auth migrations. |
| `packages/coordination/src/services/db.ts` | Postgres/Kysely connection setup plus `jam_records` schema bootstrap. |
| `CLAUDE.md` | This file. Project guide and Claude session instructions. |

## Key Dependencies

- **Bun** (`~/.bun/bin/bun`) -- JavaScript runtime, used as the server
- **bun-pty** -- PTY (pseudo-terminal) bindings for Bun, used to spawn and control Claude Code processes
- **React** -- SSR-rendered UI shells plus browser hydration for runtime and coordination
- **Vite** -- Frontend dev server, client bundling, and asset manifests
- **@xterm/xterm** -- Terminal emulator in the browser, bundled via ESM
- **@xterm/addon-fit** -- Auto-sizes the terminal to fit its container

## Server Details (`packages/runtime/src/server`)

### HTTP routes
- `GET /` -- serves the Bun-rendered React shell for the runtime app
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
- Working directory: session/project cwd; the default project uses `JAM_CWD`, otherwise `$HOME`
- Auto-sends Enter after 3s and 5s to dismiss the trust prompt

### Session management
- Sessions are in-memory only (lost on server restart, though Claude sessions persist on disk and can be resumed)
- Scrollback buffer is capped at 200k chars (trimmed to last 100k)
- Chat history is capped at 200 messages per session
- A default "General" session is created on startup

## Frontend Details (`packages/runtime/src/web`)

The runtime browser app now uses React + TypeScript. Bun server code under `src/server` renders the initial HTML shell, while `src/web/main.client.tsx` hydrates the app in the browser. Runtime-specific UI state and behavior live in `RuntimeApp.tsx` and browser helpers under `src/web/lib`.

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
- **Default project working directory**: `JAM_CWD` if set, otherwise `$HOME`
- **Runtime**: Bun (at `~/.bun/bin/bun`)
- **Permissions**: Running with `--dangerously-skip-permissions`
- **GitHub**: Authenticated as `bryanhpchiang`
- **Coordination auth/persistence**: Better Auth + PostgreSQL

## Coding Conventions

- **TypeScript** for both server and frontend code
- React for browser UI and Bun SSR page shells
- Vite for client bundling, HMR, and manifest-driven asset injection
- Compact, terse code style -- short variable names, chained expressions, minimal whitespace
- Runtime types live in `packages/runtime/src/server/types.ts`
- Bun-native APIs preferred (`Bun.serve`, `Bun.file`, `Bun.write`)
- Error handling via empty `catch {}` blocks (fail silently, keep going)
- No logging framework -- plain `console.log`

### Do not duplicate shared utilities

`packages/shared/` contains crypto, cookie, and HTTP helpers used by both `coordination` and `runtime`. **Before writing any new utility function, check `packages/shared/src/` for an existing implementation.** If the function you need exists there, import it -- do not reimplement it in the consuming package. If a helper is useful to more than one package, add it to `shared/` rather than copying it.

Key exports from `shared`:
- **Crypto**: `signToken`, `verifyToken`, `hashToken`, `createRandomToken`, `toBase64Url`, `fromBase64Url`, `importHmacKey`
- **HTTP**: `serializeCookie`, `clearCookie`, `getCookie`, `isSecureRequest`

Package-specific wrappers (e.g. `coordination/services/jam-tokens.ts`, `coordination/services/http.ts`) re-export from `shared` and may add domain logic on top. Prefer importing from the wrapper when one exists for your package, and from `shared` directly otherwise.

## Solve The Real Requirement

- Implement the underlying capability the user asked for, not a superficial approximation of it.
- Do not satisfy a product requirement with hardcoded UI, simulated behavior, guessed values, mock data, or placeholder logic unless the user explicitly asked for a prototype or mock.
- If the requested UX depends on missing backend support, instrumentation, or real state, build that support first or clearly report the blocker. Do not quietly replace it with a fake frontend-only version.
- When a request is ambiguous, optimize for the user's actual outcome, not the cheapest interpretation that makes the ticket look complete.

## Gotchas and Important Notes

- The server must be restarted if runtime server files change. There is no hot-reload.
- `bun-pty` is a native module -- if Bun is updated, you may need to reinstall deps.
- The trust prompt auto-dismiss (sending Enter at 3s and 5s) is timing-dependent and may occasionally fail on slow starts.
- Session state is in-memory. A server restart kills all active sessions. Users can resume Claude sessions from disk via the "New Session" menu.
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
