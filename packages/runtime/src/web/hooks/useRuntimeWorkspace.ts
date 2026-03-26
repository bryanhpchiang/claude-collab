import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { TerminalHandle } from "../components/TerminalPanel";
import type {
  DiskSession,
  ProjectSummary,
  SessionSummary,
} from "../types";

const DEFAULT_SESSION_SENTINEL = "__default__";

type UseRuntimeWorkspaceOptions = {
  appendSystemRef: MutableRefObject<(text: string) => void>;
  fetchStateSummary(): Promise<void>;
  joinSessionRef: MutableRefObject<((sessionId: string) => void) | null>;
  resetSessionRealtimeRef: MutableRefObject<() => void>;
  resetSummary(): void;
  sendWsRef: MutableRefObject<(payload: unknown) => boolean>;
  startPolling(): void;
  terminalRef: MutableRefObject<TerminalHandle | null>;
  wsConnectedRef: MutableRefObject<boolean>;
};

export function useRuntimeWorkspace({
  appendSystemRef,
  fetchStateSummary,
  joinSessionRef,
  resetSessionRealtimeRef,
  resetSummary,
  sendWsRef,
  startPolling,
  terminalRef,
  wsConnectedRef,
}: UseRuntimeWorkspaceOptions) {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionList, setSessionList] = useState<SessionSummary[]>([]);
  const [pendingJoin, setPendingJoin] = useState<string | null>(null);
  const [diskSessions, setDiskSessions] = useState<DiskSession[]>([]);
  const [loadingDiskSessions, setLoadingDiskSessions] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");

  // Store the first project ID from the server for API calls (not rendered)
  const currentProjectIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef(currentSessionId);
  const sessionListRef = useRef(sessionList);

  const showSessionClose = sessionList.length > 1;

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    sessionListRef.current = sessionList;
  }, [sessionList]);

  useEffect(() => {
    if (currentSessionId && !sessionList.some((session) => session.id === currentSessionId)) {
      setCurrentSessionId(null);
    }

    if (
      !pendingJoin &&
      !currentSessionId &&
      sessionList.length > 0
    ) {
      setPendingJoin(DEFAULT_SESSION_SENTINEL);
    }
  }, [currentSessionId, pendingJoin, sessionList]);

  const showLobby = () => {
    setCurrentSessionId(null);
    terminalRef.current?.hideOauthModal();
    terminalRef.current?.setInteractiveMode(false);
    resetSummary();
  };

  const joinSession = (sessionId: string) => {
    if (!sessionId) return;

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("s", sessionId);
    history.replaceState(null, "", nextUrl);

    if (!wsConnectedRef.current) {
      setPendingJoin(sessionId);
      return;
    }

    if (currentSessionIdRef.current === sessionId) return;

    setCurrentSessionId(sessionId);
    const targetSession = sessionListRef.current.find((session) => session.id === sessionId);
    if (targetSession?.projectId) {
      currentProjectIdRef.current = targetSession.projectId;
    }

    if (!sendWsRef.current({ type: "join-session", sessionId })) {
      setPendingJoin(sessionId);
      return;
    }

    terminalRef.current?.resetForSession();
    resetSessionRealtimeRef.current();

    setTimeout(() => { try { terminalRef.current?.fit(); } catch {} }, 50);
    fetchStateSummary().catch(() => undefined);
    startPolling();
  };

  useEffect(() => {
    if (!pendingJoin || !wsConnectedRef.current) return;

    if (pendingJoin === DEFAULT_SESSION_SENTINEL) {
      const fallback = sessionList.find((session) => session.name === "General") || sessionList[0];
      if (fallback) joinSession(fallback.id);
      setPendingJoin(null);
      return;
    }

    const target = sessionList.find((session) => session.id === pendingJoin);
    if (target?.projectId) {
      currentProjectIdRef.current = target.projectId;
    }
    if (target) joinSession(target.id);
    setPendingJoin(null);
  }, [pendingJoin, sessionList]);


  useEffect(() => {
    joinSessionRef.current = joinSession;
  }, [joinSession, joinSessionRef]);

  const handleSocketOpen = (requestedSessionId: string | null) => {
    setPendingJoin(requestedSessionId || DEFAULT_SESSION_SENTINEL);
  };

  const handleProjectsUpdate = (projects: ProjectSummary[], sessions: SessionSummary[]) => {
    // Store the first project ID for API calls; ignore the rest of the project list
    if (projects.length > 0 && !currentProjectIdRef.current) {
      currentProjectIdRef.current = projects[0].id;
    }
    setSessionList(sessions);
  };

  const handleSessionsUpdate = (sessions: SessionSummary[]) => {
    setSessionList(sessions);
  };

  const handleUsersUpdate = (users: string[]) => {
    if (!currentSessionIdRef.current) return;
    setSessionList((current) => current.map((session) => (
      session.id === currentSessionIdRef.current
        ? { ...session, users }
        : session
    )));
  };

  const handleSocketDisconnect = () => {
    // Don't clear currentSessionId — keep the terminal visible during a transient
    // disconnect. The session will be re-joined when handleSocketOpen fires on
    // reconnect. The useEffect above handles the case where the session disappears
    // from the server's session list.
  };

  const createFreshSession = async () => {
    const name = `Tab ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    const url = currentProjectIdRef.current
      ? `/api/projects/${currentProjectIdRef.current}/sessions`
      : "/api/sessions";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, projectId: currentProjectIdRef.current }),
    });
    return response.json();
  };

  const createSession = async (resumeId?: string, nameOverride?: string) => {
    const name = (nameOverride ?? "").trim() ||
      `Tab ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    const url = currentProjectIdRef.current
      ? `/api/projects/${currentProjectIdRef.current}/sessions`
      : "/api/sessions";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, resumeId, projectId: currentProjectIdRef.current }),
    });
    const session = await response.json();
    if (session.id) {
      joinSession(session.id);
    }
  };

  const deleteSession = async (sessionId: string, userCount: number) => {
    if (sessionList.length <= 1) return;
    if (
      userCount > 0 &&
      !window.confirm(
        `There ${userCount === 1 ? "is 1 user" : `are ${userCount} users`} in this tab. Close it?`,
      )
    ) {
      return;
    }

    const response = await fetch("/api/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      appendSystemRef.current(data?.error || "Failed to close tab.");
      return;
    }

    if (currentSessionIdRef.current === sessionId) {
      const nextSession = sessionList.find((session) => session.id !== sessionId);
      if (nextSession) joinSession(nextSession.id);
      else showLobby();
    }
  };

  const saveSessionRename = async () => {
    if (!editingSessionId) return;
    const nextName = editingSessionName.trim();
    if (!nextName) {
      setEditingSessionId(null);
      return;
    }

    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingSessionId, name: nextName }),
    }).catch(() => undefined);

    setEditingSessionId(null);
  };

  const beginSessionRename = (session: SessionSummary) => {
    setEditingSessionId(session.id);
    setEditingSessionName(session.name);
  };

  const resumeDiskSession = (diskSession: DiskSession) => {
    const nextName = diskSession.firstMessage.slice(0, 30) || diskSession.claudeSessionId.slice(0, 8);
    createSession(diskSession.claudeSessionId, nextName).catch(() => undefined);
  };

  return {
    beginSessionRename,
    createFreshSession,
    createSession,
    currentSessionId,
    deleteSession,
    diskSessions,
    editingSessionId,
    editingSessionName,
    handleProjectsUpdate,
    handleSessionsUpdate,
    handleSocketDisconnect,
    handleSocketOpen,
    handleUsersUpdate,
    joinSession,
    loadingDiskSessions,
    resumeDiskSession,
    saveSessionRename,
    sessionList,
    setEditingSessionName,
    showSessionClose,
  };
}
