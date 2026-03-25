import { nameColor } from "../lib/colors.js";
import type { ProjectSummary, SessionSummary } from "../types";

type RuntimeHeaderProps = {
  connectedUsers: string[];
};

export function RuntimeHeader({ connectedUsers }: RuntimeHeaderProps) {
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
