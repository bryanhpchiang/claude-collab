import { spawn, type IPty } from "bun-pty";
import { readdir, readFile, mkdir, stat } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";
import { resolveProjectCwd } from "./project-paths";
import { buildClaudeInput } from "./session-input";
const UPLOAD_DIR = "/tmp/claude-uploads";

const HOME_DIR = process.env.HOME || "/root";
const claudePath = process.env.CLAUDE_PATH || execSync("which claude").toString().trim();
const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude/projects");
const DEFAULT_PROJECT_CWD = process.env.JAM_CWD || HOME_DIR;
const DEFAULT_NEW_PROJECTS_DIR = join(HOME_DIR, "projects");

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
  projectId: string; // which project this session belongs to
  claudeSessionId?: string; // UUID from claude's own session system
  shell: IPty;
  scrollback: string;
  chatHistory: object[];
  createdAt: number;
}

interface Project {
  id: string;
  name: string;
  cwd: string;
  sessions: Map<string, Session>;
  createdAt: number;
}

interface DiskSession {
  claudeSessionId: string;
  project: string;
  firstMessage: string;
  timestamp: string;
  lastModified: string;
}

const projects = new Map<string, Project>();
// Flat lookup: sessionId -> Session (kept in sync for quick access)
const sessions = new Map<string, Session>();
const clientSession = new Map<any, string>();
const clientInfo = new Map<any, { name: string; projectId?: string }>();
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

// Secrets store (in-memory only)
interface Secret {
  name: string;
  value: string;
  createdBy: string;
  createdAt: number;
}
const secrets = new Map<string, Secret>();
// Extra env vars to inject into Claude processes (set by secrets)
const extraEnv: Record<string, string> = {};

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
          for (const line of lines.reverse()) {
            try {
              const entry = JSON.parse(line);
              if (entry.type === "user" && entry.message?.content) {
                const msg = entry.message.content;
                let text = "";
                if (typeof msg === "string") {
                  text = msg;
                } else if (Array.isArray(msg)) {
                  const textPart = msg.find((p: any) => p.type === "text");
                  text = textPart?.text || "";
                  if (!text) continue; // skip tool-result-only messages
                }
                // Skip empty, interrupts, and tool-result-only messages
                if (!text || text.includes("[Request interrupted") || text.startsWith("tool_result")) continue;
                firstMessage = text.slice(0, 80);
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
    cwd: cwd || process.env.JAM_CWD || process.cwd(),
    env: {
      ...process.env as Record<string, string>,
      ...extraEnv,
      TERM: "xterm-256color",
      HOME: process.env.HOME || "/root",
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    },
  });
}

function createProject(name: string, cwd?: string): Project {
  const id = genId();
  const project: Project = {
    id,
    name,
    cwd: cwd || process.env.JAM_CWD || process.cwd(),
    sessions: new Map(),
    createdAt: Date.now(),
  };
  projects.set(id, project);
  console.log(`Project created: ${id} "${name}" cwd=${project.cwd}`);
  return project;
}

function createSession(name: string, projectId: string, resumeId?: string, cwdOverride?: string): Session {
  const id = genId();
  const project = projects.get(projectId);
  const cwd = cwdOverride || project?.cwd;
  const args = resumeId
    ? ["--resume", resumeId, "--append-system-prompt", systemPrompt]
    : ["--append-system-prompt", systemPrompt];

  const shell = spawnClaude(args, cwd);

  const session: Session = {
    id,
    name,
    projectId,
    claudeSessionId: resumeId,
    shell,
    scrollback: "",
    chatHistory: [],
    createdAt: Date.now(),
  };

  shell.onData((data: string) => {
    session.scrollback += data;
    if (session.scrollback.length > 200000) {
      session.scrollback = session.scrollback.slice(-100000);
    }
    broadcastToSession(id, { type: "output", data });
  });

  shell.onExit(({ exitCode, signal }) => {
    console.log(`Session ${id} claude exited: code=${exitCode} signal=${signal}`);
    const reason = exitCode === 0 ? 'normally' : signal ? `due to signal ${signal}` : `with error code ${exitCode}`;
    broadcastToSession(id, {
      type: "system",
      text: `Claude process exited ${reason}. Use the "Start New Session" button below or click "+ New Session" above to start over.`,
    });
  });

  sessions.set(id, session);
  if (project) project.sessions.set(id, session);
  console.log(`Session created: ${id} "${name}" project=${projectId}${resumeId ? ` (resume: ${resumeId})` : ""} (pid: ${shell.pid})`);
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
    projectId: s.projectId,
    users: getSessionUsers(s.id),
    createdAt: s.createdAt,
  }));
}

function getProjectList() {
  return [...projects.values()].map(p => ({
    id: p.id,
    name: p.name,
    cwd: p.cwd,
    sessionCount: p.sessions.size,
    sessions: [...p.sessions.values()].map(s => ({
      id: s.id,
      name: s.name,
      projectId: s.projectId,
      users: getSessionUsers(s.id),
      createdAt: s.createdAt,
    })),
    createdAt: p.createdAt,
  }));
}

// Defined as a function that uses the `server` variable (hoisted, assigned after Bun.serve)
let broadcastLobby = () => {};
function initBroadcastLobby(srv: any) {
  broadcastLobby = () => {
    srv.publish("lobby", JSON.stringify({
      type: "projects",
      projects: getProjectList(),
      sessions: getSessionList(),
    }));
  };
}

// Create default project and session
const defaultProject = createProject("Default", DEFAULT_PROJECT_CWD);
createSession("General", defaultProject.id);

const server = Bun.serve({
  port: 7681,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // --- Project API ---
    if (url.pathname === "/api/projects") {
      if (req.method === "GET") {
        return Response.json(getProjectList());
      }
      if (req.method === "POST") {
        return (async () => {
          const body = await req.json() as { name?: string; cwd?: string };
          const name = body.name || "Untitled";
          // Default: create ~/projects/<slug> if no cwd given
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || genId();
          const cwd = resolveProjectCwd(body.cwd, {
            defaultCwd: join(DEFAULT_NEW_PROJECTS_DIR, slug),
            baseDir: HOME_DIR,
            homeDir: HOME_DIR,
          });
          await mkdir(cwd, { recursive: true });
          const project = createProject(name, cwd);
          // Create a default General session in the new project
          const defaultSession = createSession("General", project.id);
          broadcastLobby();
          return Response.json({ id: project.id, name: project.name, cwd: project.cwd, defaultSessionId: defaultSession.id });
        })();
      }
    }

    // DELETE /api/projects/:id
    const projectDeleteMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9]+)$/);
    if (projectDeleteMatch && req.method === "DELETE") {
      const projectId = projectDeleteMatch[1];
      if (projects.size <= 1) return Response.json({ error: "cannot delete last project" }, { status: 400 });
      const project = projects.get(projectId);
      if (!project) return Response.json({ error: "not found" }, { status: 404 });
      // Kill all sessions in this project
      for (const s of project.sessions.values()) {
        try { s.shell.kill(); } catch {}
        broadcastToSession(s.id, { type: "system", text: "Project deleted. Session closed." });
        sessions.delete(s.id);
      }
      projects.delete(projectId);
      broadcastLobby();
      return Response.json({ ok: true });
    }

    // Project-scoped session creation: POST /api/projects/:id/sessions
    const projectSessionMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9]+)\/sessions$/);
    if (projectSessionMatch && req.method === "POST") {
      return (async () => {
        const projectId = projectSessionMatch[1];
        const project = projects.get(projectId);
        if (!project) return Response.json({ error: "project not found" }, { status: 404 });
        const body = await req.json() as { name?: string; resumeId?: string };
        const name = body.name || "Untitled";
        const session = createSession(name, projectId, body.resumeId);
        broadcastLobby();
        return Response.json({ id: session.id, name: session.name, projectId });
      })();
    }

    if (url.pathname === "/api/sessions") {
      if (req.method === "GET") {
        return Response.json(getSessionList());
      }
      if (req.method === "POST") {
        return (async () => {
          const body = await req.json() as { name?: string; resumeId?: string; projectId?: string };
          const name = body.name || "Untitled";
          // Use specified project or fall back to first project
          const projectId = body.projectId || [...projects.keys()][0];
          const session = createSession(name, projectId, body.resumeId);
          broadcastLobby();
          return Response.json({ id: session.id, name: session.name, projectId: session.projectId });
        })();
      }
      if (req.method === "PATCH") {
        return (async () => {
          const body = await req.json() as { id: string; name: string };
          const session = sessions.get(body.id);
          if (!session) return Response.json({ error: "not found" }, { status: 404 });
          session.name = body.name;
          broadcastLobby();
          return Response.json({ id: session.id, name: session.name });
        })();
      }
      if (req.method === "DELETE") {
        return (async () => {
          const body = await req.json() as { id: string };
          const session = sessions.get(body.id);
          if (!session) return Response.json({ error: "not found" }, { status: 404 });
          const project = projects.get(session.projectId);
          if (project && project.sessions.size <= 1) return Response.json({ error: "cannot delete last session in project" }, { status: 400 });
          try { session.shell.kill(); } catch {}
          broadcastToSession(body.id, { type: "system", text: "Session closed." });
          sessions.delete(body.id);
          if (project) project.sessions.delete(body.id);
          broadcastLobby();
          return Response.json({ ok: true });
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

    // --- Secrets API ---
    if (url.pathname === "/api/secrets") {
      if (req.method === "GET") {
        const list = [...secrets.values()].map(s => ({ name: s.name, createdBy: s.createdBy, createdAt: s.createdAt }));
        return Response.json(list);
      }
      if (req.method === "POST") {
        return (async () => {
          const body = await req.json() as { name?: string; value?: string; user?: string };
          if (!body.name || !body.value || !body.user) return Response.json({ error: "missing fields" }, { status: 400 });
          secrets.set(body.name, { name: body.name, value: body.value, createdBy: body.user, createdAt: Date.now() });
          // Auto-apply
          try {
            if (body.name === "GitHub Token") {
              extraEnv.GH_TOKEN = body.value;
              extraEnv.GITHUB_TOKEN = body.value;
              execSync(`git config --global credential.helper store`, {});
              execSync(`printf 'protocol=https\\nhost=github.com\\nusername=oauth2\\npassword=${body.value}\\n' | git credential-store store`, { shell: true });
              // Also rewrite any existing git remote in all active sessions
              for (const session of sessions.values()) {
                try {
                  const remote = execSync("git remote get-url origin", { cwd: session.cwd }).toString().trim();
                  const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
                  if (m) execSync(`git remote set-url origin https://${body.value}@github.com/${m[1]}.git`, { cwd: session.cwd });
                } catch {}
              }
            } else if (body.name === "Anthropic API Key") {
              extraEnv.ANTHROPIC_API_KEY = body.value;
            } else if (body.name === "Twilio SID") {
              extraEnv.TWILIO_ACCOUNT_SID = body.value;
            } else if (body.name === "Twilio Auth Token") {
              extraEnv.TWILIO_AUTH_TOKEN = body.value;
            } else if (body.name === "Twilio Phone Number") {
              extraEnv.TWILIO_PHONE_NUMBER = body.value;
            } else {
              // Custom secret: store as env var with sanitized name
              const envKey = body.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
              extraEnv[envKey] = body.value;
            }
          } catch {}
          return Response.json({ ok: true, name: body.name });
        })();
      }
    }

    const secretDeleteMatch = url.pathname.match(/^\/api\/secrets\/(.+)$/);
    if (secretDeleteMatch && req.method === "DELETE") {
      const name = decodeURIComponent(secretDeleteMatch[1]);
      const user = url.searchParams.get("user");
      const secret = secrets.get(name);
      if (!secret) return Response.json({ error: "not found" }, { status: 404 });
      if (secret.createdBy !== user) return Response.json({ error: "unauthorized" }, { status: 403 });
      secrets.delete(name);
      // Clean up env
      if (name === "Anthropic API Key") delete extraEnv.ANTHROPIC_API_KEY;
      else if (name === "Twilio SID") delete extraEnv.TWILIO_ACCOUNT_SID;
      else if (name === "Twilio Auth Token") delete extraEnv.TWILIO_AUTH_TOKEN;
      else if (name === "Twilio Phone Number") delete extraEnv.TWILIO_PHONE_NUMBER;
      else { const k = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"); delete extraEnv[k]; }
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/restart" && req.method === "POST") {
      setTimeout(() => {
        const child = Bun.spawn([process.env.HOME + "/.bun/bin/bun", "run", "server.ts"], {
          cwd: process.cwd(),
          stdio: ["ignore", "ignore", "ignore"],
          env: process.env,
        });
        child.unref();
        process.exit(0);
      }, 500);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/deploy" && req.method === "POST") {
      return (async () => {
        try {
          const cwd = process.cwd();
          const proc = Bun.spawn(["git", "pull", "origin", "main"], { cwd, stdout: "pipe", stderr: "pipe" });
          const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
          ]);
          const exitCode = await proc.exited;
          return Response.json({ ok: exitCode === 0, stdout, stderr, exitCode });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
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
            const defaultProjectId = [...projects.keys()][0];
            const session = createSession(sessionName, defaultProjectId, undefined, cwd);

            jamSessions.set(jamId, {
              id: jamId,
              sessionId: session.id,
              repo: body.repo,
              createdAt: Date.now(),
            });

            // Notify lobby
            broadcastLobby();

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
      broadcastLobby();
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
      // Serve React app with the jam session ID embedded
      return (async () => {
        // Try React build first, fall back to public/index.html
        const buildPath = "client/dist/index.html";
        const fallbackPath = "public/index.html";
        const buildFile = Bun.file(buildPath);
        const file = await buildFile.exists() ? buildFile : Bun.file(fallbackPath);
        const html = await file.text();
        const injected = html.replace(
          "</head>",
          `<script>window.JAM_SESSION_ID='${jam.sessionId}';</script>\n</head>`
        );
        return new Response(injected, {
          headers: { "Content-Type": "text/html" },
        });
      })();
    }

    // --- Serve landing page at / (skip on EC2 instances) ---
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const file = process.env.JAM_MODE === "instance" ? "public/index.html" : "public/landing.html";
      return new Response(Bun.file(file), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // --- Serve app at /app ---
    if (url.pathname === "/app") {
      return new Response(Bun.file("public/index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/api/state-summary" && req.method === "GET") {
      const lines: string[] = ["# State of Things\n"];

      // Active Sessions
      lines.push("## Active Sessions\n");
      if (sessions.size === 0) {
        lines.push("_No active sessions_\n");
      } else {
        for (const s of sessions.values()) {
          const users = getSessionUsers(s.id);
          const age = Date.now() - s.createdAt;
          const mins = Math.floor(age / 60000);
          const timeStr = mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
          let alive = false;
          try { alive = !!s.shell.pid && process.kill(s.shell.pid, 0) === true; } catch { alive = false; }
          const status = alive ? "running" : "exited";
          lines.push(`- **${s.name}** — ${users.length} user${users.length !== 1 ? "s" : ""} · created ${timeStr} · Claude: \`${status}\``);
        }
        lines.push("");
      }

      // Connected Users
      lines.push("## Connected Users\n");
      const allUsers: { name: string; session: string }[] = [];
      for (const [ws, sid] of clientSession) {
        const info = clientInfo.get(ws);
        const session = sessions.get(sid);
        if (info && session) allUsers.push({ name: info.name, session: session.name });
      }
      if (allUsers.length === 0) {
        lines.push("_No users connected_\n");
      } else {
        for (const u of allUsers) lines.push(`- **${u.name}** in _${u.session}_`);
        lines.push("");
      }

      // Recent Activity
      lines.push("## Recent Activity\n");
      const recent: { text: string; name?: string; session: string; type: string; ts?: number }[] = [];
      for (const s of sessions.values()) {
        for (const msg of s.chatHistory.slice(-10)) {
          const m = msg as any;
          if (m.type === "chat") recent.push({ text: m.text, name: m.name, session: s.name, type: "chat", ts: m.timestamp });
          else if (m.type === "system") recent.push({ text: m.text, session: s.name, type: "system", ts: m.timestamp });
        }
      }
      const last5 = recent.slice(-5);
      if (last5.length === 0) {
        lines.push("_No recent activity_\n");
      } else {
        for (const r of last5) {
          const prefix = r.type === "chat" ? `**${r.name}**` : "_system_";
          lines.push(`- [${r.session}] ${prefix}: ${r.text.slice(0, 120)}`);
        }
        lines.push("");
      }

      return Response.json({ markdown: lines.join("\n"), lastModified: Date.now() });
    }

    // --- Serve React build static assets ---
    if (url.pathname.startsWith("/assets/") || url.pathname === "/favicon.svg") {
      const filePath = `client/dist${url.pathname}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const ext = url.pathname.split('.').pop() || '';
        const mimeTypes: Record<string, string> = {
          js: 'application/javascript',
          css: 'text/css',
          svg: 'image/svg+xml',
          png: 'image/png',
          jpg: 'image/jpeg',
          woff: 'font/woff',
          woff2: 'font/woff2',
        };
        return new Response(file, {
          headers: { "Content-Type": mimeTypes[ext] || "application/octet-stream" },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("lobby");
      // Send projects and sessions
      ws.send(JSON.stringify({ type: "projects", projects: getProjectList(), sessions: getSessionList() }));
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
          session.shell.write(
            buildClaudeInput({ name, text: data.text, direct: Boolean(data.direct) }),
          );

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
              sessionId,
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

        if (data.type === "tty-input") {
          const sessionId = clientSession.get(ws);
          if (!sessionId) return;
          const session = sessions.get(sessionId);
          if (!session) return;
          if (typeof data.data !== "string" || data.data.length === 0) return;
          session.shell.write(data.data);
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

        if (data.type === "mark-mentions-read") {
          const info = clientInfo.get(ws);
          if (info) {
            pendingMentions.delete(info.name.toLowerCase());
          }
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

initBroadcastLobby(server);
console.log(`Jam running on http://localhost:7681`);
