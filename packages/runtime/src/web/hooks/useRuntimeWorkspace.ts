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

  const mergeSession = (session: Partial<SessionSummary> | null | undefined, fallbackName?: string) => {
    if (!session?.id) return null;
    const nextSession: SessionSummary = {
      id: session.id,
      name: session.name || fallbackName || "Untitled",
      projectId: session.projectId || currentProjectIdRef.current || "",
      users: Array.isArray(session.users) ? session.users : [],
      createdAt: typeof session.createdAt === "number" ? session.createdAt : Date.now(),
    };
    if (nextSession.projectId) currentProjectIdRef.current = nextSession.projectId;
    setSessionList((current) => {
      const existingIndex = current.findIndex((entry) => entry.id === nextSession.id);
      if (existingIndex === -1) return [...current, nextSession];
      const copy = [...current];
      copy[existingIndex] = { ...copy[existingIndex], ...nextSession };
      return copy;
    });
    return nextSession;
  };

  const syncWorkspaceSnapshot = async (
    onlyIfEmpty = false,
    isActive: (() => boolean) | null = null,
  ) => {
    const [sessionsResponse, projectsResponse] = await Promise.all([
      fetch("/api/sessions"),
      fetch("/api/projects"),
    ]);

    if (
      (!isActive || isActive()) &&
      sessionsResponse.ok &&
      (!onlyIfEmpty || sessionListRef.current.length === 0)
    ) {
      const sessions: SessionSummary[] = await sessionsResponse.json();
      if ((!isActive || isActive()) && (!onlyIfEmpty || sessionListRef.current.length === 0)) {
        setSessionList(sessions);
      }
    }

    if ((!isActive || isActive()) && projectsResponse.ok && !currentProjectIdRef.current) {
      const projects: ProjectSummary[] = await projectsResponse.json();
      if ((!isActive || isActive()) && projects.length > 0 && !currentProjectIdRef.current) {
        currentProjectIdRef.current = projects[0].id;
      }
    }
  };

  // Fetch sessions via HTTP on mount as a fallback in case the WS is slow or broken
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await syncWorkspaceSnapshot(true, () => active);
      } catch {}
    })();
    return () => { active = false; };
  }, []);

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

    // Always update the selected session and project ref so the tab appears active
    const targetSession = sessionListRef.current.find((session) => session.id === sessionId);
    if (targetSession?.projectId) {
      currentProjectIdRef.current = targetSession.projectId;
    }

    if (!wsConnectedRef.current) {
      // Set the session as current so the tab highlights, and queue the WS join
      setCurrentSessionId(sessionId);
      setPendingJoin(sessionId);
      return;
    }

    if (currentSessionIdRef.current === sessionId) return;

    setCurrentSessionId(sessionId);

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

  // Resolve pending joins: either pick a default session or join a specific one.
  // This runs when WS connects (pendingJoin set by handleSocketOpen) or when
  // sessions arrive via HTTP/WS (sessionList changes).
  useEffect(() => {
    if (!pendingJoin) return;

    let targetId: string | null = null;

    if (pendingJoin === DEFAULT_SESSION_SENTINEL) {
      const fallback = sessionList.find((session) => session.name === "General") || sessionList[0];
      if (!fallback) return; // no sessions yet, wait for them
      targetId = fallback.id;
    } else {
      const target = sessionList.find((session) => session.id === pendingJoin);
      if (!target) return; // target session not in list yet
      if (target.projectId) currentProjectIdRef.current = target.projectId;
      targetId = target.id;
    }

    setPendingJoin(null);

    // If WS is ready, do a full join (send the join message, reset terminal, etc.)
    if (wsConnectedRef.current) {
      // Force the join even if currentSessionId already matches (e.g. WS reconnected)
      setCurrentSessionId(targetId);
      if (sendWsRef.current({ type: "join-session", sessionId: targetId })) {
        terminalRef.current?.resetForSession();
        resetSessionRealtimeRef.current();
        setTimeout(() => { try { terminalRef.current?.fit(); } catch {} }, 50);
        fetchStateSummary().catch(() => undefined);
        startPolling();
      } else {
        setPendingJoin(targetId);
      }
    } else {
      // WS not ready — select the tab visually, will do full join when WS connects
      setCurrentSessionId(targetId);
    }
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
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }
    const session = await response.json();
    mergeSession(session, name);
    syncWorkspaceSnapshot().catch(() => undefined);
    return session;
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
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }
    const session = await response.json();
    mergeSession(session, name);
    syncWorkspaceSnapshot().catch(() => undefined);
    if (session.id) {
      joinSession(session.id);
    }
    return session;
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

    setSessionList((current) => current.filter((session) => session.id !== sessionId));
    syncWorkspaceSnapshot().catch(() => undefined);

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

    setSessionList((current) => current.map((session) => (
      session.id === editingSessionId
        ? { ...session, name: nextName }
        : session
    )));
    syncWorkspaceSnapshot().catch(() => undefined);

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
