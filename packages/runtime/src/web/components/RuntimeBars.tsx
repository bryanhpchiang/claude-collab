import { useState } from "react";
import { nameColor } from "../lib/colors.js";
import type { ProjectSummary, SessionSummary } from "../types";

type RuntimeHeaderProps = {
  connectedUsers: string[];
  onOpenInvite?(): void;
};

export function RuntimeHeader({ connectedUsers, onOpenInvite }: RuntimeHeaderProps) {
  const [restarting, setRestarting] = useState(false);

  async function handleRestart() {
    if (!confirm("This will git pull and restart the server. All sessions will be lost. Continue?")) return;
    setRestarting(true);
    try {
      await fetch("/api/restart", { method: "POST" });
    } catch {}
  }

  return (
    <div id="header">
      <a href="https://letsjam.now" rel="noopener" className="brand-link" title="Back to Jam lobby">
        <svg className="logo-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff9a56" />
              <stop offset="100%" stopColor="#ff6b6b" />
            </linearGradient>
          </defs>
          <g transform="translate(32,34)">
            <rect x="-12" y="-18" width="24" height="28" rx="4" fill="none" stroke="url(#hg)" strokeWidth="3" />
            <rect x="-14" y="-20" width="28" height="8" rx="3" fill="url(#hg)" opacity="0.9" />
            <circle cx="-4" cy="0" r="2.5" fill="#ff9a56" opacity="0.8" />
            <circle cx="4" cy="4" r="2" fill="#ffcc80" opacity="0.7" />
            <circle cx="-2" cy="6" r="1.5" fill="#ff6b6b" opacity="0.6" />
          </g>
        </svg>
        <span className="brand-jam">Jam</span>
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleRestart}
          disabled={restarting}
          title="Git pull latest changes and restart the server"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 600,
            color: restarting ? "#8b949e" : "#e6edf3",
            background: "rgba(139,148,158,0.1)",
            border: "1px solid rgba(139,148,158,0.3)",
            borderRadius: 6,
            cursor: restarting ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
          </svg>
          {restarting ? "Restarting..." : "Restart"}
        </button>
        {onOpenInvite && (
          <button
            type="button"
            onClick={onOpenInvite}
            title="Invite someone to this jam"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 600,
              color: "#e6edf3",
              background: "linear-gradient(135deg, rgba(255,154,86,0.15), rgba(255,107,107,0.15))",
              border: "1px solid rgba(255,154,86,0.3)",
              borderRadius: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M11 2a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM0 13c0-2.8 2.2-5 5-5h6c2.8 0 5 2.2 5 5v1H0v-1z" />
              <path d="M13 5.5a.5.5 0 0 1 .5-.5H15v-1.5a.5.5 0 0 1 1 0V5h1.5a.5.5 0 0 1 0 1H16v1.5a.5.5 0 0 1-1 0V6h-1.5a.5.5 0 0 1-.5-.5z" />
            </svg>
            Invite
          </button>
        )}
        <div id="users-bar">
          {connectedUsers.map((user, index) => (
            <span key={user}>
              {index > 0 ? "\u00A0\u00A0" : null}
              <span className="user-dot"></span>
              <span style={{ color: nameColor(user) }}>{user}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type ProjectBarProps = {
  currentProjectId: string | null;
  projectList: ProjectSummary[];
  showProjectClose: boolean;
  onDeleteProject(projectId: string): void;
  onOpenNewProject(): void;
  onSwitchProject(projectId: string): void;
};

export function ProjectBar({
  currentProjectId,
  projectList,
  showProjectClose,
  onDeleteProject,
  onOpenNewProject,
  onSwitchProject,
}: ProjectBarProps) {
  return (
    <div id="project-bar">
      {projectList.map((project) => (
        <div
          className={`project-tab${project.id === currentProjectId ? " active" : ""}`}
          data-id={project.id}
          key={project.id}
          title={project.cwd}
          onClick={() => onSwitchProject(project.id)}
        >
          <span className="proj-name">{project.name}</span>
          <span className="proj-count">{project.sessionCount}</span>
          <button
            className={`proj-close${showProjectClose ? " visible" : ""}`}
            title="Delete project"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteProject(project.id);
            }}
          >
            &times;
          </button>
        </div>
      ))}
      <button id="new-project-btn" type="button" onClick={onOpenNewProject}>
        + Project
      </button>
    </div>
  );
}

type SessionBarProps = {
  currentSessionId: string | null;
  editingSessionId: string | null;
  editingSessionName: string;
  filteredSessions: SessionSummary[];
  showSessionClose: boolean;
  onDeleteSession(sessionId: string, userCount: number): void;
  onEditingSessionNameChange(value: string): void;
  onJoinSession(sessionId: string): void;
  onOpenNewSession(): void;
  onSaveSessionRename(): void;
  onStartRename(session: SessionSummary): void;
};

export function SessionBar({
  currentSessionId,
  editingSessionId,
  editingSessionName,
  filteredSessions,
  showSessionClose,
  onDeleteSession,
  onEditingSessionNameChange,
  onJoinSession,
  onOpenNewSession,
  onSaveSessionRename,
  onStartRename,
}: SessionBarProps) {
  return (
    <div id="session-bar">
      {filteredSessions.map((session) => (
        <div
          className={`session-tab${session.id === currentSessionId ? " active" : ""}`}
          data-id={session.id}
          key={session.id}
          onClick={() => onJoinSession(session.id)}
          onDoubleClick={() => onStartRename(session)}
        >
          {editingSessionId === session.id ? (
            <input
              autoFocus
              style={{
                background: "#0d1117",
                border: "1px solid #58a6ff",
                color: "#e6edf3",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 12,
                width: 100,
                outline: "none",
              }}
              value={editingSessionName}
              onBlur={onSaveSessionRename}
              onChange={(event) => onEditingSessionNameChange(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  onSaveSessionRename();
                }
              }}
            />
          ) : (
            <span className="tab-name">{session.name}</span>
          )}
          <span className="user-count">{session.users.length}</span>
          <button
            className={`close-btn${showSessionClose ? " visible" : ""}`}
            title="Close session"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteSession(session.id, session.users.length);
            }}
          >
            &times;
          </button>
        </div>
      ))}
      <button id="new-session-btn" type="button" onClick={onOpenNewSession}>
        + New Session
      </button>
    </div>
  );
}
