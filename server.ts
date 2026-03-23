import { spawn, type IPty } from "bun-pty";
import { readdir, readFile, mkdir, stat } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = "/tmp/claude-uploads";

const claudePath = "/home/exedev/.local/bin/claude";
const CLAUDE_PROJECTS_DIR = join(process.env.HOME || "/home/exedev", ".claude/projects");

const systemPrompt = [
  "You are in a MULTIPLAYER session. Multiple users are typing messages to you through a shared web terminal.",
  "NEVER write code directly in the main conversation. ALWAYS delegate code writing, file editing, and implementation to background agents using the Agent tool with run_in_background:true.",
  "Launch multiple agents in parallel when users ask for different things.",
  "Your job in the main thread is to: respond to users, mediate, coordinate, and summarize agent results. Keep responses SHORT — the terminal is shared.",
  "Prefix user messages with their name when responding. Be fast, casual, and autonomous.",
  "You are a MEDIATOR, not just a task executor. When users make conflicting requests, flag the conflict and help them align before proceeding — don't silently serve both.",
  "When one user makes a decision that affects the group, surface it so others are aware.",
  "Push back on requests that conflict with the group's goals or another user's in-progress work.",
  "Prioritize coherence over speed — it's better to ask 'does everyone agree?' than to ship conflicting changes.",
  "Help the group stay coordinated: track who's working on what and prevent people from stepping on each other's toes.",
].join(" ");

interface Session {
  id: string;
  name: string;
  claudeSessionId?: string; // UUID from claude's own session system
  shell: IPty;
  scrollback: string;
  chatHistory: object[];
  createdAt: number;
}

interface DiskSession {
  claudeSessionId: string;
  project: string;
  firstMessage: string;
  timestamp: string;
  lastModified: string;
}

const sessions = new Map<string, Session>();
const clientSession = new Map<any, string>();
const clientInfo = new Map<any, { name: string }>();
const MAX_CHAT_HISTORY = 200;

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Scan disk for existing Claude Code sessions
async function getDiskSessions(): Promise<DiskSession[]> {
  const results: DiskSession[] = [];
  try {
    const projects = await readdir(CLAUDE_PROJECTS_DIR);
    for (const project of projects) {
      const projectDir = join(CLAUDE_PROJECTS_DIR, project);
      const files = await readdir(projectDir).catch(() => []);
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const claudeSessionId = file.replace(".jsonl", "");
        const filePath = join(projectDir, file);
        try {
          const fileStat = await stat(filePath);
          const lastModified = fileStat.mtime.toISOString();
          const content = await readFile(filePath, "utf-8");
          const lines = content.split("\n").filter(Boolean);
          let firstMessage = "";
          let timestamp = "";
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (entry.type === "user" && entry.message?.content) {
                const msg = entry.message.content;
                firstMessage = (typeof msg === "string" ? msg : JSON.stringify(msg)).slice(0, 80);
                timestamp = entry.timestamp || "";
                break;
              }
            } catch {}
          }
          results.push({
            claudeSessionId,
            project: project.replace(/-/g, "/").replace(/^\//, ""),
            firstMessage: firstMessage || "(empty session)",
            timestamp,
            lastModified,
          });
        } catch {}
      }
    }
  } catch {}
  results.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  return results;
}

function spawnClaude(args: string[]): IPty {
  return spawn(claudePath, [
    "--dangerously-skip-permissions",
    ...args,
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
}

function createSession(name: string, resumeId?: string): Session {
  const id = genId();
  const args = resumeId
    ? ["--resume", resumeId, "--append-system-prompt", systemPrompt]
    : ["--append-system-prompt", systemPrompt];

  const shell = spawnClaude(args);

  const session: Session = {
    id,
    name,
    claudeSessionId: resumeId,
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
  console.log(`Session created: ${id} "${name}"${resumeId ? ` (resume: ${resumeId})` : ""} (pid: ${shell.pid})`);
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
          const body = await req.json() as { name?: string; resumeId?: string };
          const name = body.name || "Untitled";
          const session = createSession(name, body.resumeId);
          server.publish("lobby", JSON.stringify({ type: "sessions", sessions: getSessionList() }));
          return Response.json({ id: session.id, name: session.name });
        })();
      }
      if (req.method === "PATCH") {
        return (async () => {
          const body = await req.json() as { id: string; name: string };
          const session = sessions.get(body.id);
          if (!session) return Response.json({ error: "not found" }, { status: 404 });
          session.name = body.name;
          server.publish("lobby", JSON.stringify({ type: "sessions", sessions: getSessionList() }));
          return Response.json({ id: session.id, name: session.name });
        })();
      }
    }

    if (url.pathname === "/api/disk-sessions") {
      return (async () => Response.json(await getDiskSessions()))();
    }

    if (url.pathname === "/api/upload-image" && req.method === "POST") {
      return (async () => {
        try {
          await mkdir(UPLOAD_DIR, { recursive: true });
          const formData = await req.formData();
          const file = formData.get("image") as File | null;
          if (!file) return Response.json({ error: "No image provided" }, { status: 400 });
          const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
          const filename = `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const filepath = join(UPLOAD_DIR, filename);
          await Bun.write(filepath, file);
          return Response.json({ path: filepath });
        } catch (err) {
          return Response.json({ error: "Upload failed" }, { status: 500 });
        }
      })();
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

console.log(`Jam running on http://localhost:7681`);
