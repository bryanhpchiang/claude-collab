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
        <svg className="logo-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M25 18h50c2 0 3 1 3 3v6H22v-6c0-2 1-3 3-3z" fill="url(#rt-jar-lid)"/>
          <path d="M22 27h56v6c0 2-4 4-8 5H30c-4-1-8-3-8-5v-6z" fill="url(#rt-jar-lid)" opacity="0.7"/>
          <path d="M30 38h40c5 0 9 3 10 8l4 26c1 5-3 10-8 10H24c-5 0-9-5-8-10l4-26c1-5 5-8 10-8z" fill="url(#rt-jar-body)"/>
          <path d="M34 48c4 8 12 14 16 18 4-4 12-10 16-18" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" fill="none"/>
          <defs>
            <linearGradient id="rt-jar-lid" x1="25" y1="18" x2="75" y2="33" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E8A838"/><stop offset="1" stopColor="#D4872C"/>
            </linearGradient>
            <linearGradient id="rt-jar-body" x1="20" y1="38" x2="80" y2="82" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgba(232,168,56,0.18)"/><stop offset="1" stopColor="rgba(212,135,44,0.08)"/>
            </linearGradient>
          </defs>
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
            color: restarting ? "#9B8FC2" : "#E8E2F4",
            background: "rgba(155,143,194,0.1)",
            border: "1px solid rgba(155,143,194,0.3)",
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
              color: "#E8E2F4",
              background: "linear-gradient(135deg, rgba(232,168,56,0.15), rgba(212,135,44,0.15))",
              border: "1px solid rgba(232,168,56,0.3)",
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
                background: "#0C0A14",
                border: "1px solid #E8A838",
                color: "#E8E2F4",
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
