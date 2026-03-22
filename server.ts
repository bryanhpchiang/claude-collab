import { spawn, type IPty } from "bun-pty";

const claudePath = "/home/exedev/.local/bin/claude";

const systemPrompt = [
  "You are in a MULTIPLAYER session. Multiple users are typing messages to you through a shared web terminal.",
  "ALWAYS use the Agent tool with run_in_background:true for any task that takes more than a few seconds.",
  "Launch multiple agents in parallel when users ask for different things.",
  "Keep responses SHORT — the terminal is shared. Don't block the conversation with long tasks.",
  "Prefix user messages with their name when responding. Be fast, casual, and autonomous.",
].join(" ");

interface Session {
  id: string;
  name: string;
  shell: IPty;
  scrollback: string;
  chatHistory: object[];
  createdAt: number;
}

const sessions = new Map<string, Session>();
const clientSession = new Map<any, string>(); // ws -> sessionId
const clientInfo = new Map<any, { name: string }>(); // ws -> user info
const MAX_CHAT_HISTORY = 200;

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function createSession(name: string): Session {
  const id = genId();
  const shell = spawn(claudePath, [
    "--dangerously-skip-permissions",
    "--append-system-prompt", systemPrompt,
  ], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd: "/home/exedev/claude-collab",
    env: {
      ...process.env as Record<string, string>,
      TERM: "xterm-256color",
      HOME: "/home/exedev",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    },
  });

  const session: Session = {
    id,
    name,
    shell,
    scrollback: "",
    chatHistory: [],
    createdAt: Date.now(),
  };

  // Auto-accept trust prompt
  setTimeout(() => shell.write("\r"), 3000);
  setTimeout(() => shell.write("\r"), 5000);

  shell.onData((data: string) => {
    session.scrollback += data;
    if (session.scrollback.length > 200000) {
      session.scrollback = session.scrollback.slice(-100000);
    }
    broadcastToSession(id, { type: "output", data });
  });

  shell.onExit(({ exitCode, signal }) => {
    console.log(`Session ${id} claude exited: code=${exitCode} signal=${signal}`);
    broadcastToSession(id, {
      type: "system",
      text: `Claude process exited (code ${exitCode}). Create a new session to continue.`,
    });
  });

  sessions.set(id, session);
  console.log(`Session created: ${id} "${name}" (pid: ${shell.pid})`);
  return session;
}

function broadcastToSession(sessionId: string, msg: object) {
  const session = sessions.get(sessionId);
  if (!session) return;

  if ("type" in msg && ((msg as any).type === "chat" || (msg as any).type === "system")) {
    session.chatHistory.push(msg);
    if (session.chatHistory.length > MAX_CHAT_HISTORY) {
      session.chatHistory.splice(0, session.chatHistory.length - MAX_CHAT_HISTORY);
    }
  }
  server.publish(`session:${sessionId}`, JSON.stringify(msg));
}

function getSessionUsers(sessionId: string): string[] {
  const users: string[] = [];
  for (const [ws, sid] of clientSession) {
    if (sid === sessionId) {
      const info = clientInfo.get(ws);
      if (info) users.push(info.name);
    }
  }
  return users;
}

function getSessionList() {
  return [...sessions.values()].map(s => ({
    id: s.id,
    name: s.name,
    users: getSessionUsers(s.id),
    createdAt: s.createdAt,
  }));
}

// Create default session
createSession("General");

const server = Bun.serve({
  port: 7681,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/api/sessions") {
      if (req.method === "GET") {
        return Response.json(getSessionList());
      }
      if (req.method === "POST") {
        return (async () => {
          const body = await req.json() as { name?: string };
          const name = body.name || "Untitled";
          const session = createSession(name);
          // Notify all connected clients about new session
          server.publish("lobby", JSON.stringify({ type: "sessions", sessions: getSessionList() }));
          return Response.json({ id: session.id, name: session.name });
        })();
      }
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("public/index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("lobby");
      // Send session list
      ws.send(JSON.stringify({ type: "sessions", sessions: getSessionList() }));
    },
    message(ws, msg) {
      try {
        const data = JSON.parse(msg as string);

        if (data.type === "join-session") {
          const sessionId = data.sessionId;
          const session = sessions.get(sessionId);
          if (!session) return;

          // Leave old session if any
          const oldSession = clientSession.get(ws);
          if (oldSession) {
            ws.unsubscribe(`session:${oldSession}`);
            const info = clientInfo.get(ws);
            if (info) {
              broadcastToSession(oldSession, { type: "system", text: `${info.name} left` });
              broadcastToSession(oldSession, { type: "users", users: getSessionUsers(oldSession) });
            }
          }

          // Join new session
          clientSession.set(ws, sessionId);
          clientInfo.set(ws, { name: data.name });
          ws.subscribe(`session:${sessionId}`);

          // Send session state
          ws.send(JSON.stringify({ type: "output", data: session.scrollback }));
          ws.send(JSON.stringify({ type: "users", users: getSessionUsers(sessionId) }));
          for (const msg of session.chatHistory) {
            ws.send(JSON.stringify(msg));
          }

          broadcastToSession(sessionId, { type: "system", text: `${data.name} joined` });
          broadcastToSession(sessionId, { type: "users", users: getSessionUsers(sessionId) });
        }

        if (data.type === "input") {
          const sessionId = clientSession.get(ws);
          if (!sessionId) return;
          const session = sessions.get(sessionId);
          if (!session) return;
          const info = clientInfo.get(ws);
          const name = info?.name || "anon";
          broadcastToSession(sessionId, { type: "chat", name, text: data.text });
          session.shell.write(`[${name}]: ${data.text}` + "\r");
        }

        if (data.type === "key") {
          const sessionId = clientSession.get(ws);
          if (!sessionId) return;
          const session = sessions.get(sessionId);
          if (!session) return;
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
    },
  },
});

console.log(`Claude Collab running on http://localhost:7681`);
