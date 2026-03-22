// @bun
var __require = import.meta.require;

// node_modules/bun-pty/src/terminal.ts
import { dlopen, FFIType, ptr } from "bun:ffi";
import { Buffer } from "buffer";

// node_modules/bun-pty/src/interfaces.ts
class EventEmitter {
  listeners = [];
  event = (listener) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(listener);
        if (i !== -1) {
          this.listeners.splice(i, 1);
        }
      }
    };
  };
  fire(data) {
    for (const listener of this.listeners) {
      listener(data);
    }
  }
}

// node_modules/bun-pty/src/terminal.ts
import { join, dirname, basename } from "path";
import { existsSync } from "fs";
var DEFAULT_COLS = 80;
var DEFAULT_ROWS = 24;
var DEFAULT_FILE = "sh";
var DEFAULT_NAME = "xterm";
function shQuote(s) {
  if (s.length === 0)
    return "''";
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function resolveLibPath() {
  const env = process.env.BUN_PTY_LIB;
  if (env && existsSync(env))
    return env;
  try {
    const embeddedPath = __require(`../rust-pty/target/release/${process.platform === "win32" ? "rust_pty.dll" : process.platform === "darwin" ? process.arch === "arm64" ? "librust_pty_arm64.dylib" : "librust_pty.dylib" : process.arch === "arm64" ? "librust_pty_arm64.so" : "librust_pty.so"}`);
    if (embeddedPath)
      return embeddedPath;
  } catch {}
  const platform = process.platform;
  const arch = process.arch;
  const filenames = platform === "darwin" ? arch === "arm64" ? ["librust_pty_arm64.dylib", "librust_pty.dylib"] : ["librust_pty.dylib"] : platform === "win32" ? ["rust_pty.dll"] : arch === "arm64" ? ["librust_pty_arm64.so", "librust_pty.so"] : ["librust_pty.so"];
  const base = Bun.fileURLToPath(import.meta.url);
  const fileDir = dirname(base);
  const dirName = basename(fileDir);
  const here = dirName === "src" || dirName === "dist" ? dirname(fileDir) : fileDir;
  const basePaths = [
    join(here, "rust-pty", "target", "release"),
    join(here, "..", "bun-pty", "rust-pty", "target", "release"),
    join(process.cwd(), "node_modules", "bun-pty", "rust-pty", "target", "release")
  ];
  const fallbackPaths = [];
  for (const basePath of basePaths) {
    for (const filename of filenames) {
      fallbackPaths.push(join(basePath, filename));
    }
  }
  for (const path of fallbackPaths) {
    if (existsSync(path))
      return path;
  }
  throw new Error(`librust_pty shared library not found.
Checked:
  - BUN_PTY_LIB=${env ?? "<unset>"}
  - ${fallbackPaths.join(`
  - `)}

Set BUN_PTY_LIB or ensure one of these paths contains the file.`);
}
var libPath = resolveLibPath();
var lib;
try {
  lib = dlopen(libPath, {
    bun_pty_spawn: {
      args: [FFIType.cstring, FFIType.cstring, FFIType.cstring, FFIType.i32, FFIType.i32],
      returns: FFIType.i32
    },
    bun_pty_write: {
      args: [FFIType.i32, FFIType.pointer, FFIType.i32],
      returns: FFIType.i32
    },
    bun_pty_read: {
      args: [FFIType.i32, FFIType.pointer, FFIType.i32],
      returns: FFIType.i32
    },
    bun_pty_resize: {
      args: [FFIType.i32, FFIType.i32, FFIType.i32],
      returns: FFIType.i32
    },
    bun_pty_kill: { args: [FFIType.i32], returns: FFIType.i32 },
    bun_pty_get_pid: { args: [FFIType.i32], returns: FFIType.i32 },
    bun_pty_get_exit_code: { args: [FFIType.i32], returns: FFIType.i32 },
    bun_pty_close: { args: [FFIType.i32], returns: FFIType.void }
  });
} catch (error) {
  console.error("Failed to load lib", error);
}

class Terminal {
  handle = -1;
  _pid = -1;
  _cols = DEFAULT_COLS;
  _rows = DEFAULT_ROWS;
  _name = DEFAULT_NAME;
  _readLoop = false;
  _closing = false;
  _decoder = new TextDecoder("utf-8");
  _onData = new EventEmitter;
  _onExit = new EventEmitter;
  constructor(file = DEFAULT_FILE, args = [], opts = { name: DEFAULT_NAME }) {
    this._cols = opts.cols ?? DEFAULT_COLS;
    this._rows = opts.rows ?? DEFAULT_ROWS;
    const cwd = opts.cwd ?? process.cwd();
    const cmdline = [shQuote(file), ...args.map(shQuote)].join(" ");
    let envStr = "";
    if (opts.env) {
      const envPairs = Object.entries(opts.env).map(([k, v]) => `${k}=${v}`);
      envStr = envPairs.join("\x00") + "\x00";
    }
    this.handle = lib.symbols.bun_pty_spawn(Buffer.from(`${cmdline}\x00`, "utf8"), Buffer.from(`${cwd}\x00`, "utf8"), Buffer.from(`${envStr}\x00`, "utf8"), this._cols, this._rows);
    if (this.handle < 0)
      throw new Error("PTY spawn failed");
    this._pid = lib.symbols.bun_pty_get_pid(this.handle);
    this._startReadLoop();
  }
  get pid() {
    return this._pid;
  }
  get cols() {
    return this._cols;
  }
  get rows() {
    return this._rows;
  }
  get process() {
    return "shell";
  }
  get onData() {
    return this._onData.event;
  }
  get onExit() {
    return this._onExit.event;
  }
  write(data) {
    if (this._closing)
      return;
    const buf = Buffer.from(data, "utf8");
    lib.symbols.bun_pty_write(this.handle, ptr(buf), buf.length);
  }
  resize(cols, rows) {
    if (this._closing)
      return;
    this._cols = cols;
    this._rows = rows;
    lib.symbols.bun_pty_resize(this.handle, cols, rows);
  }
  kill(signal = "SIGTERM") {
    if (this._closing)
      return;
    this._closing = true;
    lib.symbols.bun_pty_kill(this.handle);
    lib.symbols.bun_pty_close(this.handle);
    this._onExit.fire({ exitCode: 0, signal });
  }
  async _startReadLoop() {
    if (this._readLoop)
      return;
    this._readLoop = true;
    const buf = Buffer.allocUnsafe(4096);
    while (this._readLoop && !this._closing) {
      const n = lib.symbols.bun_pty_read(this.handle, ptr(buf), buf.length);
      if (n > 0) {
        const decoded = this._decoder.decode(buf.subarray(0, n), { stream: true });
        if (decoded) {
          this._onData.fire(decoded);
        }
      } else if (n === -2) {
        const remaining = this._decoder.decode();
        if (remaining) {
          this._onData.fire(remaining);
        }
        const exitCode = lib.symbols.bun_pty_get_exit_code(this.handle);
        this._onExit.fire({ exitCode });
        break;
      } else if (n < 0) {
        const remaining = this._decoder.decode();
        if (remaining) {
          this._onData.fire(remaining);
        }
        break;
      } else {
        await new Promise((r) => setTimeout(r, 8));
      }
    }
  }
}

// node_modules/bun-pty/src/index.ts
function spawn(file, args, options) {
  return new Terminal(file, args, options);
}

// server.ts
var claudePath = "/home/exedev/.local/bin/claude";
var systemPrompt = [
  "You are in a MULTIPLAYER session. Multiple users are typing messages to you through a shared web terminal.",
  "ALWAYS use the Agent tool with run_in_background:true for any task that takes more than a few seconds.",
  "Launch multiple agents in parallel when users ask for different things.",
  "Keep responses SHORT \u2014 the terminal is shared. Don't block the conversation with long tasks.",
  "Prefix user messages with their name when responding. Be fast, casual, and autonomous."
].join(" ");
var sessions = new Map;
var clientSession = new Map;
var clientInfo = new Map;
var MAX_CHAT_HISTORY = 200;
function genId() {
  return Math.random().toString(36).slice(2, 8);
}
function createSession(name) {
  const id = genId();
  const shell = spawn(claudePath, [
    "--dangerously-skip-permissions",
    "--append-system-prompt",
    systemPrompt
  ], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: "/home/exedev/claude-collab",
    env: {
      ...process.env,
      TERM: "xterm-256color",
      HOME: "/home/exedev",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
    }
  });
  const session = {
    id,
    name,
    shell,
    scrollback: "",
    chatHistory: [],
    createdAt: Date.now()
  };
  setTimeout(() => shell.write("\r"), 3000);
  setTimeout(() => shell.write("\r"), 5000);
  shell.onData((data) => {
    session.scrollback += data;
    if (session.scrollback.length > 200000) {
      session.scrollback = session.scrollback.slice(-1e5);
    }
    broadcastToSession(id, { type: "output", data });
  });
  shell.onExit(({ exitCode, signal }) => {
    console.log(`Session ${id} claude exited: code=${exitCode} signal=${signal}`);
    broadcastToSession(id, {
      type: "system",
      text: `Claude process exited (code ${exitCode}). Create a new session to continue.`
    });
  });
  sessions.set(id, session);
  console.log(`Session created: ${id} "${name}" (pid: ${shell.pid})`);
  return session;
}
function broadcastToSession(sessionId, msg) {
  const session = sessions.get(sessionId);
  if (!session)
    return;
  if ("type" in msg && (msg.type === "chat" || msg.type === "system")) {
    session.chatHistory.push(msg);
    if (session.chatHistory.length > MAX_CHAT_HISTORY) {
      session.chatHistory.splice(0, session.chatHistory.length - MAX_CHAT_HISTORY);
    }
  }
  server.publish(`session:${sessionId}`, JSON.stringify(msg));
}
function getSessionUsers(sessionId) {
  const users = [];
  for (const [ws, sid] of clientSession) {
    if (sid === sessionId) {
      const info = clientInfo.get(ws);
      if (info)
        users.push(info.name);
    }
  }
  return users;
}
function getSessionList() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    name: s.name,
    users: getSessionUsers(s.id),
    createdAt: s.createdAt
  }));
}
createSession("General");
var server = Bun.serve({
  port: 7681,
  fetch(req, server2) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server2.upgrade(req))
        return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (url.pathname === "/api/sessions") {
      if (req.method === "GET") {
        return Response.json(getSessionList());
      }
      if (req.method === "POST") {
        return (async () => {
          const body = await req.json();
          const name = body.name || "Untitled";
          const session = createSession(name);
          server2.publish("lobby", JSON.stringify({ type: "sessions", sessions: getSessionList() }));
          return Response.json({ id: session.id, name: session.name });
        })();
      }
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("public/index.html"), {
        headers: { "Content-Type": "text/html" }
      });
    }
    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("lobby");
      ws.send(JSON.stringify({ type: "sessions", sessions: getSessionList() }));
    },
    message(ws, msg) {
      try {
        const data = JSON.parse(msg);
        if (data.type === "join-session") {
          const sessionId = data.sessionId;
          const session = sessions.get(sessionId);
          if (!session)
            return;
          const oldSession = clientSession.get(ws);
          if (oldSession) {
            ws.unsubscribe(`session:${oldSession}`);
            const info = clientInfo.get(ws);
            if (info) {
              broadcastToSession(oldSession, { type: "system", text: `${info.name} left` });
              broadcastToSession(oldSession, { type: "users", users: getSessionUsers(oldSession) });
            }
          }
          clientSession.set(ws, sessionId);
          clientInfo.set(ws, { name: data.name });
          ws.subscribe(`session:${sessionId}`);
          ws.send(JSON.stringify({ type: "output", data: session.scrollback }));
          ws.send(JSON.stringify({ type: "users", users: getSessionUsers(sessionId) }));
          for (const msg2 of session.chatHistory) {
            ws.send(JSON.stringify(msg2));
          }
          broadcastToSession(sessionId, { type: "system", text: `${data.name} joined` });
          broadcastToSession(sessionId, { type: "users", users: getSessionUsers(sessionId) });
        }
        if (data.type === "input") {
          const sessionId = clientSession.get(ws);
          if (!sessionId)
            return;
          const session = sessions.get(sessionId);
          if (!session)
            return;
          const info = clientInfo.get(ws);
          const name = info?.name || "anon";
          broadcastToSession(sessionId, { type: "chat", name, text: data.text });
          session.shell.write(`[${name}]: ${data.text}` + "\r");
        }
        if (data.type === "key") {
          const sessionId = clientSession.get(ws);
          if (!sessionId)
            return;
          const session = sessions.get(sessionId);
          if (!session)
            return;
          const info = clientInfo.get(ws);
          const name = info?.name || "anon";
          broadcastToSession(sessionId, { type: "system", text: `${name} pressed ${data.label || "key"}` });
          session.shell.write(data.seq);
        }
      } catch {}
    },
    close(ws) {
      const sessionId = clientSession.get(ws);
      const info = clientInfo.get(ws);
      if (sessionId && info) {
        ws.unsubscribe(`session:${sessionId}`);
        clientSession.delete(ws);
        clientInfo.delete(ws);
        broadcastToSession(sessionId, { type: "system", text: `${info.name} left` });
        broadcastToSession(sessionId, { type: "users", users: getSessionUsers(sessionId) });
      }
      ws.unsubscribe("lobby");
    }
  }
});
console.log(`Claude Collab running on http://localhost:7681`);
