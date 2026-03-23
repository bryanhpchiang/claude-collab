import { spawn, type IPty } from "bun-pty";
import { readdir, readFile, mkdir, stat } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";

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

interface StateItem {
  id: string;
  text: string;
  author: string;
  checked?: boolean;
  assignee?: string;
  status?: 'todo' | 'in-progress' | 'done';
  timestamp: number;
}

interface ActivityEntry {
  id: string;
  text: string;
  author: string;
  timestamp: number;
}

interface SessionState {
  decisions: StateItem[];
  inProgress: StateItem[];
  actionItems: StateItem[];
  pinnedMessages: StateItem[];
  activity: ActivityEntry[];
}

interface Session {
  id: string;
  name: string;
  claudeSessionId?: string; // UUID from claude's own session system
  shell: IPty;
  scrollback: string;
  chatHistory: object[];
  createdAt: number;
  state: SessionState;
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

// Pending @mentions for users who are offline
// Key: lowercase username, Value: array of mention objects
interface PendingMention {
  from: string;
  text: string;
  sessionId: string;
  sessionName: string;
  timestamp: number;
}
const pendingMentions = new Map<string, PendingMention[]>();

// Track which sessions are "jam" sessions (created via /api/jams)
const jamSessions = new Map<string, { id: string; sessionId: string; repo?: string; createdAt: number }>();
const JAMS_DIR = "/tmp/claude-jams";

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// Scan disk for existing Claude Code sessions
async function getDiskSessions(): Promise<DiskSession[]> {
  const results: DiskSession[] = [];
  try {
    const projects = await readdir(CLAUDE_PROJECTS_DIR);
    for (const project of projects) {
      if (!project.includes("claude-collab")) continue;
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

function spawnClaude(args: string[], cwd?: string): IPty {
  return spawn(claudePath, [
    "--dangerously-skip-permissions",
    ...args,
  ], {
    name: "xterm-256color",
    cols: 120,
    rows: 60,
    cwd: cwd || "/home/exedev/claude-collab",
    env: {
      ...process.env as Record<string, string>,
      TERM: "xterm-256color",
      HOME: "/home/exedev",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    },
  });
}

function createSession(name: string, resumeId?: string, cwd?: string): Session {
  const id = genId();
  const args = resumeId
    ? ["--resume", resumeId, "--append-system-prompt", systemPrompt]
    : ["--append-system-prompt", systemPrompt];

  const shell = spawnClaude(args, cwd);

  const session: Session = {
    id,
    name,
    claudeSessionId: resumeId,
    shell,
    scrollback: "",
    chatHistory: [],
    createdAt: Date.now(),
    state: {
      decisions: [],
      inProgress: [],
      actionItems: [],
      pinnedMessages: [],
      activity: [],
    },
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

    // --- Jam API ---

    if (url.pathname === "/api/jams") {
      if (req.method === "GET") {
        // List active jam sessions with IDs and user counts
        const jams = [...jamSessions.values()].map(j => {
          const session = sessions.get(j.sessionId);
          return {
            id: j.id,
            sessionId: j.sessionId,
            repo: j.repo,
            users: session ? getSessionUsers(j.sessionId) : [],
            userCount: session ? getSessionUsers(j.sessionId).length : 0,
            createdAt: j.createdAt,
          };
        });
        return Response.json(jams);
      }
      if (req.method === "POST") {
        return (async () => {
          try {
            const body = await req.json() as { repo?: string };
            const jamId = genId();
            let cwd: string | undefined;

            // If repo provided, clone it
            if (body.repo) {
              await mkdir(JAMS_DIR, { recursive: true });
              const repoDir = join(JAMS_DIR, jamId);
              try {
                execSync(`git clone ${body.repo} ${repoDir}`, {
                  timeout: 60000,
                  stdio: "pipe",
                });
                cwd = repoDir;
              } catch (err: any) {
                return Response.json(
                  { error: "Failed to clone repo", details: err.stderr?.toString() || err.message },
                  { status: 400 }
                );
              }
            }

            const sessionName = body.repo
              ? body.repo.split("/").pop()?.replace(".git", "") || `jam-${jamId}`
              : `jam-${jamId}`;
            const session = createSession(sessionName, undefined, cwd);

            jamSessions.set(jamId, {
              id: jamId,
              sessionId: session.id,
              repo: body.repo,
              createdAt: Date.now(),
            });

            // Notify lobby
            server.publish("lobby", JSON.stringify({ type: "sessions", sessions: getSessionList() }));

            return Response.json({ id: jamId, url: `/j/${jamId}` });
          } catch (err: any) {
            return Response.json({ error: err.message }, { status: 500 });
          }
        })();
      }
    }

    // DELETE /api/jams/:id
    const jamDeleteMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)$/);
    if (jamDeleteMatch && req.method === "DELETE") {
      const jamId = jamDeleteMatch[1];
      const jam = jamSessions.get(jamId);
      if (!jam) {
        return Response.json({ error: "Jam not found" }, { status: 404 });
      }
      // Kill the session's Claude process
      const session = sessions.get(jam.sessionId);
      if (session) {
        try { session.shell.kill(); } catch {}
        broadcastToSession(jam.sessionId, {
          type: "system",
          text: "This jam session has been shut down.",
        });
        sessions.delete(jam.sessionId);
      }
      jamSessions.delete(jamId);
      // Notify lobby
      server.publish("lobby", JSON.stringify({ type: "sessions", sessions: getSessionList() }));
      return Response.json({ ok: true });
    }

    // --- Jam page: /j/:id ---
    const jamPageMatch = url.pathname.match(/^\/j\/([a-z0-9]+)$/);
    if (jamPageMatch) {
      const jamId = jamPageMatch[1];
      const jam = jamSessions.get(jamId);
      if (!jam) {
        return new Response("Jam not found", { status: 404 });
      }
      // Serve index.html with the jam session ID embedded
      return (async () => {
        const html = await Bun.file("public/index.html").text();
        const injected = html.replace(
          "</head>",
          `<script>window.JAM_SESSION_ID='${jam.sessionId}';</script>\n</head>`
        );
        return new Response(injected, {
          headers: { "Content-Type": "text/html" },
        });
      })();
    }

    // --- Serve landing page at / ---
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("public/landing.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // --- Serve app at /app ---
    if (url.pathname === "/app") {
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
          // Send current sidebar state
          ws.send(JSON.stringify({ type: "state-sync", state: session.state }));

          broadcastToSession(sessionId, { type: "system", text: `${data.name} joined` });
          broadcastToSession(sessionId, { type: "users", users: getSessionUsers(sessionId) });

          // Send any pending @mentions for this user
          const nameLower = data.name.toLowerCase();
          const pending = pendingMentions.get(nameLower);
          if (pending && pending.length > 0) {
            ws.send(JSON.stringify({
              type: "unread-mentions",
              mentions: pending,
            }));
            // Clear pending mentions after sending
            pendingMentions.delete(nameLower);
          }
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

          // Detect @mentions in the message
          const mentionRegex = /@(\w+)/g;
          let match;
          const sessionUsers = getSessionUsers(sessionId);
          const sessionUsersLower = sessionUsers.map(u => u.toLowerCase());
          while ((match = mentionRegex.exec(data.text)) !== null) {
            const mentionedName = match[1];
            const mentionedLower = mentionedName.toLowerCase();

            // Broadcast a mention event to the session
            broadcastToSession(sessionId, {
              type: "mention",
              from: name,
              mentioned: mentionedName,
              text: data.text,
              timestamp: Date.now(),
            });

            // If the mentioned user is NOT currently in this session, store as pending
            if (!sessionUsersLower.includes(mentionedLower)) {
              const pending = pendingMentions.get(mentionedLower) || [];
              pending.push({
                from: name,
                text: data.text,
                sessionId,
                sessionName: session.name,
                timestamp: Date.now(),
              });
              pendingMentions.set(mentionedLower, pending);
            }
          }
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

        if (data.type === "state-update") {
          const sessionId = clientSession.get(ws);
          if (!sessionId) return;
          const session = sessions.get(sessionId);
          if (!session) return;
          const info = clientInfo.get(ws);
          const userName = info?.name || "anon";
          const { action, section, item, itemId } = data;
          const arr = session.state[section as keyof SessionState] as any[];
          if (!arr) return;

          if (action === "add" && item) {
            arr.push(item);
            // Auto-log activity for actionItems and inProgress
            if (section === "actionItems" || section === "inProgress") {
              const label = section === "actionItems" ? "to-do" : "in-progress item";
              session.state.activity.push({
                id: Math.random().toString(36).slice(2, 10),
                text: `${userName} added ${label}: "${item.text}"${item.assignee ? ` (assigned to ${item.assignee})` : ''}`,
                author: userName,
                timestamp: Date.now(),
              });
              if (session.state.activity.length > 100) session.state.activity.splice(0, session.state.activity.length - 100);
            }
          } else if (action === "delete" && itemId) {
            const idx = arr.findIndex((i: any) => i.id === itemId);
            if (idx !== -1) arr.splice(idx, 1);
          } else if (action === "toggle" && itemId) {
            const found = arr.find((i: any) => i.id === itemId);
            if (found) found.checked = !found.checked;
          } else if (action === "set-status" && itemId && data.status) {
            const found = arr.find((i: any) => i.id === itemId);
            if (found) {
              const oldStatus = found.status || 'todo';
              found.status = data.status;
              if (data.status === 'done') found.checked = true;
              else if (data.status === 'todo') found.checked = false;
              session.state.activity.push({
                id: Math.random().toString(36).slice(2, 10),
                text: `${userName} moved "${found.text}" from ${oldStatus} to ${data.status}`,
                author: userName,
                timestamp: Date.now(),
              });
              if (session.state.activity.length > 100) session.state.activity.splice(0, session.state.activity.length - 100);
            }
          } else if (action === "set-assignee" && itemId && data.assignee !== undefined) {
            const found = arr.find((i: any) => i.id === itemId);
            if (found) {
              found.assignee = data.assignee;
              session.state.activity.push({
                id: Math.random().toString(36).slice(2, 10),
                text: `${userName} assigned "${found.text}" to ${data.assignee || 'unassigned'}`,
                author: userName,
                timestamp: Date.now(),
              });
              if (session.state.activity.length > 100) session.state.activity.splice(0, session.state.activity.length - 100);
            }
          } else if (action === "edit" && itemId && item) {
            const found = arr.find((i: any) => i.id === itemId);
            if (found) found.text = item.text;
          } else if (action === "add-activity" && item) {
            session.state.activity.push(item);
            if (session.state.activity.length > 100) session.state.activity.splice(0, session.state.activity.length - 100);
          }

          // Broadcast updated state to all clients in this session
          server.publish(`session:${sessionId}`, JSON.stringify({ type: "state-sync", state: session.state }));
        }

        if (data.type === "mark-mentions-read") {
          const info = clientInfo.get(ws);
          if (info) {
            pendingMentions.delete(info.name.toLowerCase());
          }
        }

        if (data.type === "pin-message") {
          const sessionId = clientSession.get(ws);
          if (!sessionId) return;
          const session = sessions.get(sessionId);
          if (!session) return;
          const info = clientInfo.get(ws);
          const name = info?.name || "anon";
          const pinItem: StateItem = {
            id: Math.random().toString(36).slice(2, 10),
            text: data.text,
            author: data.author || name,
            timestamp: Date.now(),
          };
          session.state.pinnedMessages.push(pinItem);
          server.publish(`session:${sessionId}`, JSON.stringify({ type: "state-sync", state: session.state }));
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
