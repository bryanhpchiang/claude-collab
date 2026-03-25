import { formatSessionTime } from "../lib/format.js";
import type { DiskSession } from "../types";

type NewSessionModalProps = {
  diskSessions: DiskSession[];
  loadingDiskSessions: boolean;
  newSessionName: string;
  onClose(): void;
  onCreate(): void;
  onResumeSession(diskSession: DiskSession): void;
  onSessionNameChange(value: string): void;
  open: boolean;
};

export function NewSessionModal({
  diskSessions,
  loadingDiskSessions,
  newSessionName,
  onClose,
  onCreate,
  onResumeSession,
  onSessionNameChange,
  open,
}: NewSessionModalProps) {
  if (!open) return null;

  return (
    <div id="name-modal">
      <div className="modal-box oauth-modal-box">
        <h2>New Session</h2>
        <p>Create a blank session or resume one from disk.</p>
        <input
          type="text"
          placeholder="Session name"
          value={newSessionName}
          onChange={(event) => onSessionNameChange(event.target.value)}
        />
        <button type="button" onClick={onCreate}>
          Create
        </button>
        <div style={{ marginTop: 18, textAlign: "left" }}>
          <p style={{ color: "#8b949e", fontSize: 12, marginBottom: 8 }}>Resume from disk:</p>
          {loadingDiskSessions ? (
            <div style={{ color: "#8b949e", fontSize: 12 }}>Loading sessions from disk...</div>
          ) : !diskSessions.length ? (
            <div style={{ color: "#8b949e", fontSize: 12 }}>No sessions found on disk</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {diskSessions.map((diskSession) => {
                const time = formatSessionTime(diskSession.lastModified || diskSession.timestamp);
                return (
                  <button
                    key={diskSession.claudeSessionId}
                    type="button"
                    style={{
                      textAlign: "left",
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      color: "#e6edf3",
                      padding: 10,
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => onResumeSession(diskSession)}
                  >
                    <div style={{ marginBottom: 4 }}>{diskSession.firstMessage}</div>
                    <div style={{ fontSize: 11, color: "#8b949e" }}>
                      {diskSession.project} · {diskSession.claudeSessionId.slice(0, 8)}
                      {time ? ` · ${time}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="oauth-modal-actions">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type NewProjectModalProps = {
  newProjectCwd: string;
  newProjectName: string;
  onClose(): void;
  onCreate(): void;
  onProjectCwdChange(value: string): void;
  onProjectNameChange(value: string): void;
  open: boolean;
};

export function NewProjectModal({
  newProjectCwd,
  newProjectName,
  onClose,
  onCreate,
  onProjectCwdChange,
  onProjectNameChange,
  open,
}: NewProjectModalProps) {
  if (!open) return null;

  return (
    <div id="name-modal">
      <div className="modal-box oauth-modal-box">
        <h2>New Project</h2>
        <p>Create a workspace and its default General session.</p>
        <input
          type="text"
          placeholder="Project name"
          value={newProjectName}
          onChange={(event) => onProjectNameChange(event.target.value)}
        />
        <input
          type="text"
          placeholder="Working directory (optional, supports ~/...)"
          style={{ marginTop: 8, width: "100%" }}
          value={newProjectCwd}
          onChange={(event) => onProjectCwdChange(event.target.value)}
        />
        <div style={{ color: "#484f58", fontSize: 11, marginTop: 8 }}>
          Leave directory blank to auto-create in ~/projects/
        </div>
        <div className="oauth-modal-actions">
          <button className="secondary-btn" type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" onClick={onCreate}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
