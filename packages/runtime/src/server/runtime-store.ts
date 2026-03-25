import { spawnSync } from "child_process";
import { appendFileSync } from "fs";
import { mkdir, readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import {
  CLAUDE_PROJECTS_DIR,
  DEFAULT_PROJECT_CWD,
  HOME_DIR,
  UPLOAD_DIR,
} from "../config";

const JAM_MESSAGES_LOG = join(HOME_DIR, ".claude", "jam-messages.log");

function appendMessageLog(username: string, text: string) {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  try {
    appendFileSync(JAM_MESSAGES_LOG, `${ts} [${username}]: ${text}\n`);
  } catch {}
}
import { resolveProjectCwd } from "../project-paths";
import { buildClaudeInput } from "../session-input";
import { spawnClaude, SYSTEM_PROMPT } from "./claude";
import type {
  AuthenticatedRuntimeUser,
  ChatEvent,
  ClientInfo,
  DiskSession,
  PendingMention,
  Project,
  ProjectSummary,
  Secret,
  Session,
  SessionSummary,
  SystemEvent,
} from "./types";

type PublishFn = (channel: string, payload: string) => void;

const MAX_CHAT_HISTORY = 200;
const GITHUB_INSTEAD_OF = ["git@github.com:", "ssh://git@github.com/"];

export class RuntimeStore {
  private readonly projects = new Map<string, Project>();
  private readonly sessions = new Map<string, Session>();
  private readonly clientSession = new Map<any, string>();
  private readonly clientInfo = new Map<any, ClientInfo>();
  private readonly pendingMentions = new Map<string, PendingMention[]>();
  private readonly secrets = new Map<string, Secret>();
  private readonly extraEnv: Record<string, string> = {};
  private publish: PublishFn = () => {};

  constructor() {
    const defaultProject = this.createProject("Default", DEFAULT_PROJECT_CWD);
    this.createSession("General", defaultProject.id);
  }

  attachPublisher(publish: PublishFn) {
    this.publish = publish;
  }

  projectCount() {
    return this.projects.size;
  }

  getProject(projectId: string) {
    return this.projects.get(projectId);
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  getClientSession(ws: any) {
    return this.clientSession.get(ws);
  }

  getClientInfo(ws: any) {
    return this.clientInfo.get(ws);
  }

  setClientConnection(ws: any, sessionId: string, user: AuthenticatedRuntimeUser) {
    this.clientSession.set(ws, sessionId);
    this.clientInfo.set(ws, { user });
  }

  clearClientConnection(ws: any) {
    this.clientSession.delete(ws);
    this.clientInfo.delete(ws);
  }

  listSessions(): SessionSummary[] {
    return [...this.sessions.values()].map((session) => ({
      id: session.id,
      name: session.name,
      projectId: session.projectId,
      users: this.getSessionUsers(session.id),
      createdAt: session.createdAt,
    }));
  }

  listProjects(): ProjectSummary[] {
    return [...this.projects.values()].map((project) => ({
      id: project.id,
      name: project.name,
      cwd: project.cwd,
      sessionCount: project.sessions.size,
      sessions: [...project.sessions.values()].map((session) => ({
        id: session.id,
        name: session.name,
        projectId: session.projectId,
        users: this.getSessionUsers(session.id),
        createdAt: session.createdAt,
      })),
      createdAt: project.createdAt,
    }));
  }

  getSessionUsers(sessionId: string): string[] {
    const users: string[] = [];
    for (const [ws, joinedSessionId] of this.clientSession) {
      if (joinedSessionId !== sessionId) continue;
      const info = this.clientInfo.get(ws);
      if (info) users.push(info.user.login);
    }
    return users;
  }

  createProject(name: string, cwd?: string): Project {
    const id = this.genId();
    const project: Project = {
      id,
      name,
      cwd: cwd || HOME_DIR,
      sessions: new Map(),
      createdAt: Date.now(),
    };
    this.projects.set(id, project);
    console.log(`Project created: ${id} "${name}" cwd=${project.cwd}`);
    return project;
  }

  createWorkspaceProject(name: string, cwdInput?: string): Project {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || this.genId();
    const cwd = resolveProjectCwd(cwdInput, {
      defaultCwd: join(HOME_DIR, "projects", slug),
      baseDir: HOME_DIR,
      homeDir: HOME_DIR,
    });
    return this.createProject(name, cwd);
  }

  async ensureProjectDirectory(project: Project) {
    await mkdir(project.cwd, { recursive: true });
  }

  createSession(name: string, projectId: string, resumeId?: string, cwdOverride?: string): Session {
    const id = this.genId();
    const project = this.projects.get(projectId);
    const cwd = cwdOverride || project?.cwd;
    const args = resumeId
      ? ["--resume", resumeId, "--append-system-prompt", SYSTEM_PROMPT]
      : ["--append-system-prompt", SYSTEM_PROMPT];
    const shell = spawnClaude({
      args,
      cwd,
      extraEnv: this.extraEnv,
    });

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
      this.publishJson(`session:${id}`, { type: "output", data });
    });

    shell.onExit(({ exitCode, signal }) => {
      console.log(`Session ${id} claude exited: code=${exitCode} signal=${signal}`);
      const reason =
        exitCode === 0
          ? "normally"
          : signal
            ? `due to signal ${signal}`
            : `with error code ${exitCode}`;
      this.broadcastSystem(
        id,
        `Claude process exited ${reason}. Use the "Start New Session" button below or click "+ New Session" above to start over.`,
      );
    });

    this.sessions.set(id, session);
    if (project) project.sessions.set(id, session);
    console.log(
      `Session created: ${id} "${name}" project=${projectId}${resumeId ? ` (resume: ${resumeId})` : ""} (pid: ${shell.pid})`,
    );
    return session;
  }

  renameSession(sessionId: string, name: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.name = name;
    return session;
  }

  removeSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    try {
      session.shell.kill();
    } catch {}

    this.broadcastSystem(sessionId, "Session closed.");
    this.sessions.delete(sessionId);
    const project = this.projects.get(session.projectId);
    if (project) project.sessions.delete(sessionId);
    return session;
  }

  removeProject(projectId: string) {
    const project = this.projects.get(projectId);
    if (!project) return null;

    for (const session of project.sessions.values()) {
      try {
        session.shell.kill();
      } catch {}
      this.broadcastSystem(session.id, "Project deleted. Session closed.");
      this.sessions.delete(session.id);
    }

    this.projects.delete(projectId);
    return project;
  }

  broadcastLobby() {
    this.publishJson("lobby", {
      type: "projects",
      projects: this.listProjects(),
      sessions: this.listSessions(),
    });
  }

  broadcastSystem(sessionId: string, text: string) {
    this.broadcastToSession(sessionId, { type: "system", text, timestamp: Date.now() });
  }

  broadcastUsers(sessionId: string) {
    this.broadcastToSession(sessionId, {
      type: "users",
      users: this.getSessionUsers(sessionId),
    });
  }

  handleChatInput(sessionId: string, name: string, text: string, direct: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    appendMessageLog(name, text);
    this.broadcastChat(sessionId, name, text);
    session.shell.write(buildClaudeInput({ name, text, direct }));
    this.recordMentions(sessionId, name, text);
  }

  handleTtyInput(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !data) return;
    session.shell.write(data);
  }

  handleKeyInput(sessionId: string, name: string, seq: string, label?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.broadcastSystem(sessionId, `${name} pressed ${label || "key"}`);
    session.shell.write(seq);
  }

  getPendingMentions(name: string): PendingMention[] {
    return this.pendingMentions.get(name.toLowerCase()) || [];
  }

  clearPendingMentions(name: string) {
    this.pendingMentions.delete(name.toLowerCase());
  }

  async getDiskSessions(): Promise<DiskSession[]> {
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
            for (const line of lines.reverse()) {
              try {
                const entry = JSON.parse(line);
                if (entry.type !== "user" || !entry.message?.content) continue;
                const message = entry.message.content;
                let text = "";
                if (typeof message === "string") {
                  text = message;
                } else if (Array.isArray(message)) {
                  const textPart = message.find((part: any) => part.type === "text");
                  text = textPart?.text || "";
                  if (!text) continue;
                }
                if (!text || text.includes("[Request interrupted") || text.startsWith("tool_result")) continue;
                firstMessage = text.slice(0, 80);
                timestamp = entry.timestamp || "";
                break;
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

    results.sort(
      (left, right) =>
        new Date(right.lastModified).getTime() - new Date(left.lastModified).getTime(),
    );
    return results;
  }

  async saveUpload(file: File | null) {
    if (!file) return null;
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const filename = `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = join(UPLOAD_DIR, filename);
    await Bun.write(filepath, file);
    return filepath;
  }

  listSecrets() {
    return [...this.secrets.values()].map((secret) => ({
      name: secret.name,
      createdBy: secret.createdByLogin,
      createdAt: secret.createdAt,
    }));
  }

  private setGlobalGitConfig(key: string, value: string) {
    spawnSync("git", ["config", "--global", key, value]);
  }

  private replaceGlobalGitConfigValue(key: string, value: string) {
    spawnSync("git", ["config", "--global", "--fixed-value", "--unset-all", key, value]);
    spawnSync("git", ["config", "--global", "--add", key, value]);
  }

  private removeGlobalGitConfigValue(key: string, value: string) {
    spawnSync("git", ["config", "--global", "--fixed-value", "--unset-all", key, value]);
  }

  saveSecret(name: string, value: string, user: AuthenticatedRuntimeUser) {
    const previousSecret = this.secrets.get(name);
    this.secrets.set(name, {
      name,
      value,
      createdByLogin: user.login,
      createdByUserId: user.id,
      createdAt: Date.now(),
    });

    try {
      if (name === "GitHub Token") {
        this.extraEnv.GITHUB_TOKEN = value;
        this.extraEnv.GH_TOKEN = value;
        this.setGlobalGitConfig("credential.https://github.com.helper", "store");
        if (previousSecret?.value && previousSecret.value !== value) {
          spawnSync("git", ["credential", "reject"], {
            input: `protocol=https\nhost=github.com\nusername=x-access-token\npassword=${previousSecret.value}\n\n`,
          });
        }
        for (const insteadOf of GITHUB_INSTEAD_OF) {
          this.replaceGlobalGitConfigValue("url.https://github.com/.insteadOf", insteadOf);
        }
        spawnSync("git", ["credential", "approve"], {
          input: `protocol=https\nhost=github.com\nusername=x-access-token\npassword=${value}\n\n`,
        });
      } else if (name === "Anthropic API Key") {
        this.extraEnv.ANTHROPIC_API_KEY = value;
      } else if (name === "Twilio SID") {
        this.extraEnv.TWILIO_ACCOUNT_SID = value;
      } else if (name === "Twilio Auth Token") {
        this.extraEnv.TWILIO_AUTH_TOKEN = value;
      } else if (name === "Twilio Phone Number") {
        this.extraEnv.TWILIO_PHONE_NUMBER = value;
      } else {
        const envKey = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
        this.extraEnv[envKey] = value;
      }
    } catch {}
  }

  deleteSecret(name: string, user?: AuthenticatedRuntimeUser) {
    const secret = this.secrets.get(name);
    if (!secret) return { ok: false as const, status: 404 };
    if (!user || secret.createdByUserId !== user.id) {
      return { ok: false as const, status: 403 };
    }

    this.secrets.delete(name);
    if (name === "GitHub Token") {
      delete this.extraEnv.GITHUB_TOKEN;
      delete this.extraEnv.GH_TOKEN;
      spawnSync("git", ["credential", "reject"], {
        input: `protocol=https\nhost=github.com\nusername=x-access-token\npassword=${secret.value}\n\n`,
      });
      for (const insteadOf of GITHUB_INSTEAD_OF) {
        this.removeGlobalGitConfigValue("url.https://github.com/.insteadOf", insteadOf);
      }
      this.removeGlobalGitConfigValue("credential.https://github.com.helper", "store");
    } else if (name === "Anthropic API Key") delete this.extraEnv.ANTHROPIC_API_KEY;
    else if (name === "Twilio SID") delete this.extraEnv.TWILIO_ACCOUNT_SID;
    else if (name === "Twilio Auth Token") delete this.extraEnv.TWILIO_AUTH_TOKEN;
    else if (name === "Twilio Phone Number") delete this.extraEnv.TWILIO_PHONE_NUMBER;
    else delete this.extraEnv[name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")];

    return { ok: true as const };
  }

  buildStateSummary() {
    const lines: string[] = ["# State of Things\n"];

    lines.push("## Active Sessions\n");
    if (this.sessions.size === 0) {
      lines.push("_No active sessions_\n");
    } else {
      for (const session of this.sessions.values()) {
        const users = this.getSessionUsers(session.id);
        const age = Date.now() - session.createdAt;
        const mins = Math.floor(age / 60000);
        const timeStr =
          mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
        let alive = false;
        try {
          alive = !!session.shell.pid && process.kill(session.shell.pid, 0) === true;
        } catch {
          alive = false;
        }
        const status = alive ? "running" : "exited";
        lines.push(
          `- **${session.name}** — ${users.length} user${users.length !== 1 ? "s" : ""} · created ${timeStr} · Claude: \`${status}\``,
        );
      }
      lines.push("");
    }

    lines.push("## Connected Users\n");
    const allUsers: { name: string; session: string }[] = [];
    for (const [ws, sessionId] of this.clientSession) {
      const info = this.clientInfo.get(ws);
      const session = this.sessions.get(sessionId);
      if (info && session) {
        allUsers.push({ name: info.user.login, session: session.name });
      }
    }
    if (allUsers.length === 0) {
      lines.push("_No users connected_\n");
    } else {
      for (const user of allUsers) {
        lines.push(`- **${user.name}** in _${user.session}_`);
      }
      lines.push("");
    }

    lines.push("## Recent Activity\n");
    const recent = [...this.sessions.values()]
      .flatMap((session) =>
        session.chatHistory.slice(-10).map((entry) => ({
          ...entry,
          session: session.name,
        })),
      )
      .slice(-5);

    if (recent.length === 0) {
      lines.push("_No recent activity_\n");
    } else {
      for (const entry of recent) {
        const prefix = entry.type === "chat" ? `**${entry.name}**` : "_system_";
        lines.push(`- [${entry.session}] ${prefix}: ${entry.text.slice(0, 120)}`);
      }
      lines.push("");
    }

    return {
      markdown: lines.join("\n"),
      lastModified: Date.now(),
    };
  }

  private genId(): string {
    return Math.random().toString(36).slice(2, 8);
  }

  private publishJson(channel: string, payload: object) {
    this.publish(channel, JSON.stringify(payload));
  }

  private broadcastChat(sessionId: string, name: string, text: string) {
    const event: ChatEvent = {
      type: "chat",
      name,
      text,
      timestamp: Date.now(),
    };
    this.broadcastToSession(sessionId, event);
  }

  private broadcastToSession(sessionId: string, payload: object) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (
      "type" in payload &&
      ((payload as ChatEvent).type === "chat" || (payload as SystemEvent).type === "system")
    ) {
      session.chatHistory.push(payload as ChatEvent | SystemEvent);
      if (session.chatHistory.length > MAX_CHAT_HISTORY) {
        session.chatHistory.splice(0, session.chatHistory.length - MAX_CHAT_HISTORY);
      }
    }

    this.publishJson(`session:${sessionId}`, payload);
  }

  private recordMentions(sessionId: string, from: string, text: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const mentionRegex = /@(\w+)/g;
    const sessionUsers = this.getSessionUsers(sessionId).map((user) => user.toLowerCase());
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(text)) !== null) {
      const mentioned = match[1];
      this.publishJson(`session:${sessionId}`, {
        type: "mention",
        from,
        mentioned,
        text,
        sessionId,
        timestamp: Date.now(),
      });

      if (sessionUsers.includes(mentioned.toLowerCase())) continue;
      const pending = this.pendingMentions.get(mentioned.toLowerCase()) || [];
      pending.push({
        from,
        text,
        sessionId,
        sessionName: session.name,
        timestamp: Date.now(),
      });
      this.pendingMentions.set(mentioned.toLowerCase(), pending);
    }
  }
}
