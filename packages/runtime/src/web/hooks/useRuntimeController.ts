import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { TerminalHandle } from "../components/TerminalPanel";
import { useRuntimeComposer } from "./useRuntimeComposer";
import { useRuntimeRealtime } from "./useRuntimeRealtime";
import { useRuntimeSidebar } from "./useRuntimeSidebar";
import { useRuntimeWorkspace } from "./useRuntimeWorkspace";
import type {
  DiskSession,
  ProjectSummary,
  RuntimeBootstrap,
  SessionSummary,
} from "../types";

const EMPTY_STATE_HTML =
  '<div id="state-summary-empty">No activity yet. Start chatting and an AI summary will appear here.</div>';

export function useRuntimeController(bootstrap: RuntimeBootstrap) {
  const terminalRef = useRef<TerminalHandle | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const joinSessionRef = useRef<((sessionId: string) => void) | null>(null);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionList, setSessionList] = useState<SessionSummary[]>([]);
  const [pendingJoin, setPendingJoin] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<ProjectSummary[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [newSessionModalOpen, setNewSessionModalOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [diskSessions, setDiskSessions] = useState<DiskSession[]>([]);
  const [loadingDiskSessions, setLoadingDiskSessions] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCwd, setNewProjectCwd] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState("");

  const {
    fetchStateSummary,
    lastUpdatedText,
    removeSecret,
    resetSummary,
    saveSecret,
    secretCustomName,
    secretType,
    secretValue,
    secrets,
    secretsOpen,
    setSecretCustomName,
    setSecretType,
    setSecretValue,
    setSidebarOpen,
    sidebarOpen,
    startPolling,
    stateSummaryHtml,
    stopPolling,
    toggleSecrets,
    toggleSidebar,
    updatingSummary,
  } = useRuntimeSidebar(EMPTY_STATE_HTML);

  const {
    appendSystem,
    chatCollapsed,
    chatEntries,
    chatUnread,
    connectedUsers,
    dismissErrorOverlay,
    dismissMentions,
    errorOverlay,
    mentionsBanner,
    myName,
    resetChatUnread,
    resetSessionRealtime,
    sendWs,
    setChatCollapsed,
    wsConnected,
  } = useRuntimeRealtime({
    currentSessionId,
    initialUser: bootstrap.initialUser,
    joinSessionRef,
    setCurrentSessionId,
    setPendingJoin,
    setProjectList,
    setSessionList,
    stopPolling,
    terminalRef,
  });

  const {
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
  } = useRuntimeWorkspace({
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
  });

  const {
    completeMention,
    handleImagePaste,
    handleMessageChange,
    handleMessageClick,
    handleMessageKeyDown,
    mentionActiveIndex,
    mentionDropdownVisible,
    mentionOptions,
    message,
    messageInputRef,
    sendMessage,
    uploadingImage,
  } = useRuntimeComposer({
    appendSystem,
    connectedUsers,
    currentSessionId,
    myName,
    sendWs,
  });

  useEffect(() => {
    document.body.classList.toggle("in-lobby", !currentSessionId);
    return () => {
      document.body.classList.remove("in-lobby");
    };
  }, [currentSessionId]);

  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight });
  }, [chatEntries]);

  useEffect(() => {
    if (!chatCollapsed) {
      resetChatUnread();
      setTimeout(() => terminalRef.current?.fit(), 50);
      messageInputRef.current?.focus();
    }
  }, [chatCollapsed, messageInputRef, resetChatUnread]);

  const sendKey = (label: string, seq: string) => {
    sendWs({ type: "key", seq, label });
  };

  const startNewSessionFromError = async () => {
    dismissErrorOverlay();
    try {
      const session = await createFreshSession();
      if (session?.id) joinSession(session.id);
    } catch (error: any) {
      appendSystem(`Failed to create new session: ${error.message}`);
    }
  };

  return {
    terminalRef,
    headerProps: {
      connectedUsers,
    },
    projectBarProps: {
      currentProjectId,
      projectList,
      showProjectClose,
      onDeleteProject(projectId: string) {
        deleteProject(projectId).catch(() => undefined);
      },
      onOpenNewProject() {
        setNewProjectModalOpen(true);
      },
      onSwitchProject: switchProject,
    },
    sessionBarProps: {
      currentSessionId,
      editingSessionId,
      editingSessionName,
      filteredSessions,
      showSessionClose,
      onDeleteSession(sessionId: string, userCount: number) {
        deleteSession(sessionId, userCount).catch(() => undefined);
      },
      onEditingSessionNameChange: setEditingSessionName,
      onJoinSession: joinSession,
      onOpenNewSession() {
        setNewSessionModalOpen(true);
      },
      onSaveSessionRename() {
        saveSessionRename().catch(() => undefined);
      },
      onStartRename: beginSessionRename,
    },
    terminalPanelProps: {
      connectedUsers,
      currentUserName: myName,
      onClaudeReady() {
        messageInputRef.current?.focus();
      },
      onTtyInput(data: string) {
        sendWs({ type: "tty-input", data });
      },
    },
    errorOverlayProps: {
      error: errorOverlay,
      onDismiss: dismissErrorOverlay,
      onStartNewSession() {
        startNewSessionFromError().catch(() => undefined);
      },
    },
    chatPanelProps: {
      canSendMessages: wsConnected && Boolean(currentSessionId),
      chatCollapsed,
      chatEntries,
      chatLogRef,
      chatUnread,
      mentionActiveIndex,
      mentionDropdownVisible,
      mentionOptions,
      mentionsBanner,
      message,
      messageInputRef,
      myName,
      uploadingImage,
      onCompleteMention: completeMention,
      onDismissMentions: dismissMentions,
      onMessageChange: handleMessageChange,
      onMessageClick: handleMessageClick,
      onMessageKeyDown: handleMessageKeyDown,
      onMessagePaste: handleImagePaste,
      onSendKey: sendKey,
      onSendMessage() {
        sendMessage();
      },
      onToggleCollapsed() {
        setChatCollapsed((current) => !current);
      },
    },
    stateSidebarProps: {
      lastUpdatedText,
      myName,
      secretCustomName,
      secretType,
      secretValue,
      secrets,
      secretsOpen,
      sidebarOpen,
      stateSummaryHtml,
      updatingSummary,
      onCloseSidebar() {
        setSidebarOpen(false);
      },
      onDeleteSecret(name: string) {
        removeSecret(name).catch(() => undefined);
      },
      onSaveSecret() {
        saveSecret().catch(() => undefined);
      },
      onSecretCustomNameChange: setSecretCustomName,
      onSecretTypeChange: setSecretType,
      onSecretValueChange: setSecretValue,
      onToggleSecrets: toggleSecrets,
      onToggleSidebar: toggleSidebar,
    },
    newSessionModalProps: {
      diskSessions,
      loadingDiskSessions,
      newSessionName,
      open: newSessionModalOpen,
      onClose() {
        setNewSessionModalOpen(false);
      },
      onCreate() {
        createSession().catch(() => undefined);
      },
      onResumeSession: resumeDiskSession,
      onSessionNameChange: setNewSessionName,
    },
    newProjectModalProps: {
      newProjectCwd,
      newProjectName,
      open: newProjectModalOpen,
      onClose() {
        setNewProjectModalOpen(false);
      },
      onCreate() {
        createProject().catch(() => undefined);
      },
      onProjectCwdChange: setNewProjectCwd,
      onProjectNameChange: setNewProjectName,
    },
  };
}
