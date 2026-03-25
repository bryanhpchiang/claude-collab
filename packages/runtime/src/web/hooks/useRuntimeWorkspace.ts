import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { TerminalHandle } from "../components/TerminalPanel";
import type {
  DiskSession,
  ProjectSummary,
  SessionSummary,
} from "../types";

const DEFAULT_SESSION_SENTINEL = "__default__";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseRuntimeWorkspaceOptions = {
  appendSystem(text: string): void;
  currentProjectId: string | null;
  currentSessionId: string | null;
  editingSessionId: string | null;
  editingSessionName: string;
  fetchStateSummary(): Promise<void>;
  joinSessionRef: MutableRefObject<((sessionId: string) => void) | null>;
  newProjectCwd: string;
  newProjectName: string;
  newSessionModalOpen: boolean;
  newSessionName: string;
  pendingJoin: string | null;
  projectList: ProjectSummary[];
  resetSessionRealtime(): void;
  resetSummary(): void;
  sendWs(payload: unknown): boolean;
  sessionList: SessionSummary[];
  setCurrentProjectId: StateSetter<string | null>;
  setCurrentSessionId: StateSetter<string | null>;
  setDiskSessions: StateSetter<DiskSession[]>;
  setEditingSessionId: StateSetter<string | null>;
  setEditingSessionName: StateSetter<string>;
  setLoadingDiskSessions: StateSetter<boolean>;
  setNewProjectCwd: StateSetter<string>;
  setNewProjectModalOpen: StateSetter<boolean>;
  setNewProjectName: StateSetter<string>;
  setNewSessionModalOpen: StateSetter<boolean>;
  setNewSessionName: StateSetter<string>;
  setPendingJoin: StateSetter<string | null>;
  startPolling(): void;
  terminalRef: MutableRefObject<TerminalHandle | null>;
  wsConnected: boolean;
};

export function useRuntimeWorkspace({
  appendSystem,
  currentProjectId,
  currentSessionId,
  editingSessionId,
  editingSessionName,
  fetchStateSummary,
  joinSessionRef,
  newProjectCwd,
  newProjectName,
  newSessionModalOpen,
  newSessionName,
  pendingJoin,
  projectList,
  resetSessionRealtime,
  resetSummary,
  sendWs,
  sessionList,
  setCurrentProjectId,
  setCurrentSessionId,
  setDiskSessions,
  setEditingSessionId,
  setEditingSessionName,
  setLoadingDiskSessions,
  setNewProjectCwd,
  setNewProjectModalOpen,
  setNewProjectName,
  setNewSessionModalOpen,
  setNewSessionName,
  setPendingJoin,
  startPolling,
  terminalRef,
  wsConnected,
}: UseRuntimeWorkspaceOptions) {
  const currentProjectIdRef = useRef(currentProjectId);
  const currentSessionIdRef = useRef(currentSessionId);
  const sessionListRef = useRef(sessionList);

  const filteredSessions = useMemo(() => (
    currentProjectId
      ? sessionList.filter((session) => session.projectId === currentProjectId)
      : sessionList
  ), [currentProjectId, sessionList]);
  const showSessionClose = filteredSessions.length > 1;
  const showProjectClose = projectList.length > 1;

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    sessionListRef.current = sessionList;
  }, [sessionList]);

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

    if (!wsConnected) {
      setPendingJoin(sessionId);
      return;
    }

    if (currentSessionIdRef.current === sessionId) return;

    setCurrentSessionId(sessionId);
    const targetSession = sessionListRef.current.find((session) => session.id === sessionId);
    if (targetSession?.projectId && targetSession.projectId !== currentProjectIdRef.current) {
      setCurrentProjectId(targetSession.projectId);
    }

    if (!sendWs({ type: "join-session", sessionId })) {
      setPendingJoin(sessionId);
      return;
    }

    terminalRef.current?.resetForSession();
    resetSessionRealtime();

    setTimeout(() => terminalRef.current?.fit(), 50);
    fetchStateSummary().catch(() => undefined);
    startPolling();
  };

  useEffect(() => {
    const nextProjectId =
      currentProjectId && projectList.some((project) => project.id === currentProjectId)
        ? currentProjectId
        : projectList[0]?.id || null;

    if (nextProjectId !== currentProjectId) {
      setCurrentProjectId(nextProjectId);
    }

    if (currentSessionId && !sessionList.some((session) => session.id === currentSessionId)) {
      setCurrentSessionId(null);
    }

    if (
      !pendingJoin &&
      !currentSessionId &&
      nextProjectId &&
      sessionList.some((session) => session.projectId === nextProjectId)
    ) {
      setPendingJoin(DEFAULT_SESSION_SENTINEL);
    }
  }, [
    currentProjectId,
    currentSessionId,
    pendingJoin,
    projectList,
    sessionList,
    setCurrentProjectId,
    setCurrentSessionId,
    setPendingJoin,
  ]);

  useEffect(() => {
    if (!pendingJoin || !wsConnected) return;

    if (pendingJoin === DEFAULT_SESSION_SENTINEL) {
      const projectSessions = sessionList.filter((session) => session.projectId === currentProjectIdRef.current);
      const fallback = projectSessions.find((session) => session.name === "General") || projectSessions[0];
      if (fallback) joinSession(fallback.id);
      setPendingJoin(null);
      return;
    }

    const target = sessionList.find((session) => session.id === pendingJoin);
    if (target?.projectId && target.projectId !== currentProjectIdRef.current) {
      setCurrentProjectId(target.projectId);
    }
    if (target) joinSession(target.id);
    setPendingJoin(null);
  }, [joinSession, pendingJoin, sessionList, setCurrentProjectId, setPendingJoin, wsConnected]);

  useEffect(() => {
    if (!newSessionModalOpen) return;

    setLoadingDiskSessions(true);
    fetch("/api/disk-sessions")
      .then((response) => response.json())
      .then((payload) => {
        setDiskSessions(payload);
      })
      .catch(() => {
        setDiskSessions([]);
      })
      .finally(() => {
        setLoadingDiskSessions(false);
      });
  }, [newSessionModalOpen, setDiskSessions, setLoadingDiskSessions]);

  useEffect(() => {
    joinSessionRef.current = joinSession;
  }, [joinSession, joinSessionRef]);

  const createFreshSession = async () => {
    const name = `Session ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
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

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newProjectName.trim(), cwd: newProjectCwd.trim() || undefined }),
    });
    const project = await response.json();
    setNewProjectModalOpen(false);
    setNewProjectName("");
    setNewProjectCwd("");
    if (project.id) {
      setCurrentProjectId(project.id);
      if (project.defaultSessionId) joinSession(project.defaultSessionId);
    }
  };

  const deleteProject = async (projectId: string) => {
    if (projectList.length <= 1) return;
    const project = projectList.find((entry) => entry.id === projectId);
    const totalUsers = (project?.sessions || []).reduce((sum, session) => sum + session.users.length, 0);
    if (
      totalUsers > 0 &&
      !window.confirm(
        `There ${totalUsers === 1 ? "is 1 user" : `are ${totalUsers} users`} in this project. Delete it?`,
      )
    ) {
      return;
    }

    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      appendSystem(data?.error || "Failed to delete project.");
    }
  };

  const createSession = async (resumeId?: string, nameOverride?: string) => {
    const name = (nameOverride ?? newSessionName).trim() ||
      `Session ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    const url = currentProjectId
      ? `/api/projects/${currentProjectId}/sessions`
      : "/api/sessions";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, resumeId, projectId: currentProjectId }),
    });
    const session = await response.json();
    if (session.id) {
      setNewSessionModalOpen(false);
      setNewSessionName("");
      joinSession(session.id);
    }
  };

  const deleteSession = async (sessionId: string, userCount: number) => {
    if (filteredSessions.length <= 1) return;
    if (
      userCount > 0 &&
      !window.confirm(
        `There ${userCount === 1 ? "is 1 user" : `are ${userCount} users`} in this session. Close it?`,
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
      appendSystem(data?.error || "Failed to delete session.");
      return;
    }

    if (currentSessionIdRef.current === sessionId) {
      const nextSession = filteredSessions.find((session) => session.id !== sessionId);
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

  const switchProject = (projectId: string) => {
    if (currentProjectId === projectId) return;
    setCurrentProjectId(projectId);

    const sessions = sessionList.filter((session) => session.projectId === projectId);
    if (sessions.length === 0) {
      showLobby();
      return;
    }

    const general = sessions.find((session) => session.name === "General") || sessions[0];
    joinSession(general.id);
  };

  const beginSessionRename = (session: SessionSummary) => {
    setEditingSessionId(session.id);
    setEditingSessionName(session.name);
  };

  const resumeDiskSession = (diskSession: DiskSession) => {
    const nextName = diskSession.firstMessage.slice(0, 30) || diskSession.claudeSessionId.slice(0, 8);
    setNewSessionName(nextName);
    createSession(diskSession.claudeSessionId, nextName).catch(() => undefined);
  };

  return {
    beginSessionRename,
    createFreshSession,
    createProject,
    createSession,
    deleteProject,
    deleteSession,
    filteredSessions,
    joinSession,
    resumeDiskSession,
    saveSessionRename,
    showProjectClose,
    showSessionClose,
    switchProject,
  };
}
