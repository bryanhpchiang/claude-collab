import {
  useEffect,
  useRef,
} from "react";
import type { TerminalHandle } from "../components/TerminalPanel";
import { useRuntimeComposer } from "./useRuntimeComposer";
import { useRuntimeRealtime } from "./useRuntimeRealtime";
import { useRuntimeSidebar } from "./useRuntimeSidebar";
import { useRuntimeWorkspace } from "./useRuntimeWorkspace";
import type { RuntimeBootstrap } from "../types";

const EMPTY_STATE_HTML =
  '<div id="state-summary-empty">No activity yet. Start chatting and an AI summary will appear here.</div>';

export function useRuntimeController(bootstrap: RuntimeBootstrap) {
  const terminalRef = useRef<TerminalHandle | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const joinSessionRef = useRef<((sessionId: string) => void) | null>(null);
  const appendSystemRef = useRef<(text: string) => void>(() => undefined);
  const resetSessionRealtimeRef = useRef<() => void>(() => undefined);
  const sendWsRef = useRef<(payload: unknown) => boolean>(() => false);
  const wsConnectedRef = useRef(false);

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
    beginSessionRename,
    createFreshSession,
    createProject,
    createSession,
    currentProjectId,
    currentSessionId,
    deleteProject,
    deleteSession,
    diskSessions,
    editingSessionId,
    editingSessionName,
    filteredSessions,
    handleProjectsUpdate,
    handleSessionsUpdate,
    handleSocketDisconnect,
    handleSocketOpen,
    handleUsersUpdate,
    joinSession,
    loadingDiskSessions,
    newProjectCwd,
    newProjectModalOpen,
    newProjectName,
    newSessionModalOpen,
    newSessionName,
    projectList,
    resumeDiskSession,
    saveSessionRename,
    setEditingSessionName,
    setNewProjectCwd,
    setNewProjectModalOpen,
    setNewProjectName,
    setNewSessionModalOpen,
    setNewSessionName,
    showProjectClose,
    showSessionClose,
    switchProject,
  } = useRuntimeWorkspace({
    appendSystemRef,
    fetchStateSummary,
    joinSessionRef,
    resetSessionRealtimeRef,
    resetSummary,
    sendWsRef,
    startPolling,
    terminalRef,
    wsConnectedRef,
  });

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
    onProjectsUpdate: handleProjectsUpdate,
    onSessionsUpdate: handleSessionsUpdate,
    onSocketDisconnect: handleSocketDisconnect,
    onSocketOpen: handleSocketOpen,
    onUsersUpdate: handleUsersUpdate,
    stopPolling,
    terminalRef,
  });

  appendSystemRef.current = appendSystem;
  resetSessionRealtimeRef.current = resetSessionRealtime;
  sendWsRef.current = sendWs;
  wsConnectedRef.current = wsConnected;
  const canSendMessages = wsConnected && Boolean(currentSessionId);

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
      canSendMessages,
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
