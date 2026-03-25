import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { ErrorOverlayState } from "../components/ErrorOverlay";
import type { TerminalHandle } from "../components/TerminalPanel";
import type {
  AuthenticatedRuntimeUser,
  ChatEntry,
  PendingMention,
  ProjectSummary,
  SessionSummary,
} from "../types";

const DEFAULT_ERROR_OVERLAY: ErrorOverlayState = {
  visible: false,
  title: "Session ended",
  description:
    "The Claude process has exited. You can start a new session or try reconnecting.",
  showNewSession: false,
};

type UseRuntimeRealtimeOptions = {
  currentSessionId: string | null;
  enabled: boolean;
  initialUser: AuthenticatedRuntimeUser | null;
  joinSessionRef: MutableRefObject<((sessionId: string) => void) | null>;
  onProjectsUpdate(projects: ProjectSummary[], sessions: SessionSummary[]): void;
  onSessionsUpdate(sessions: SessionSummary[]): void;
  onSocketDisconnect(): void;
  onSocketOpen(requestedSessionId: string | null): void;
  onUsersUpdate(users: string[]): void;
  stopPolling(): void;
  terminalRef: MutableRefObject<TerminalHandle | null>;
};

export function useRuntimeRealtime({
  currentSessionId,
  enabled,
  initialUser,
  joinSessionRef,
  onProjectsUpdate,
  onSessionsUpdate,
  onSocketDisconnect,
  onSocketOpen,
  onUsersUpdate,
  stopPolling,
  terminalRef,
}: UseRuntimeRealtimeOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueue = useRef<string[]>([]);
  const currentSessionIdRef = useRef(currentSessionId);
  const projectsUpdateRef = useRef(onProjectsUpdate);
  const sessionsUpdateRef = useRef(onSessionsUpdate);
  const socketDisconnectRef = useRef(onSocketDisconnect);
  const socketOpenRef = useRef(onSocketOpen);
  const stopPollingRef = useRef(stopPolling);
  const usersUpdateRef = useRef(onUsersUpdate);

  const [currentUser, setCurrentUser] = useState<AuthenticatedRuntimeUser | null>(initialUser);
  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [wsConnected, setWsConnected] = useState(false);
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const [chatUnread, setChatUnread] = useState(0);
  const [mentionsBanner, setMentionsBanner] = useState<PendingMention[]>([]);
  const [errorOverlay, setErrorOverlay] = useState<ErrorOverlayState>(DEFAULT_ERROR_OVERLAY);

  const myName = currentUser?.login || "";
  const myNameRef = useRef(myName);
  const chatCollapsedRef = useRef(chatCollapsed);
  const notificationPermissionRef = useRef(notificationPermission);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  useEffect(() => {
    projectsUpdateRef.current = onProjectsUpdate;
  }, [onProjectsUpdate]);

  useEffect(() => {
    sessionsUpdateRef.current = onSessionsUpdate;
  }, [onSessionsUpdate]);

  useEffect(() => {
    socketDisconnectRef.current = onSocketDisconnect;
  }, [onSocketDisconnect]);

  useEffect(() => {
    socketOpenRef.current = onSocketOpen;
  }, [onSocketOpen]);

  useEffect(() => {
    stopPollingRef.current = stopPolling;
  }, [stopPolling]);

  useEffect(() => {
    usersUpdateRef.current = onUsersUpdate;
  }, [onUsersUpdate]);

  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

  useEffect(() => {
    chatCollapsedRef.current = chatCollapsed;
  }, [chatCollapsed]);

  useEffect(() => {
    notificationPermissionRef.current = notificationPermission;
  }, [notificationPermission]);

  useEffect(() => {
    if (!myName) return;

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission);
      });
      return;
    }

    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, [myName]);

  const sendWs = (payload: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pendingQueue.current.push(JSON.stringify(payload));
      return false;
    }
    ws.send(JSON.stringify(payload));
    if ((payload as any)?.type === "join-session") {
      const q = pendingQueue.current.splice(0);
      for (const msg of q) try { ws.send(msg); } catch {}
    }
    return true;
  };

  const appendChatEntry = (entry: ChatEntry) => {
    setChatEntries((current) => [...current, entry]);
    if (chatCollapsedRef.current) {
      setChatUnread((current) => current + 1);
    }
  };

  const appendSystem = (text: string) => {
    appendChatEntry({ type: "system", text });
  };

  const dismissErrorOverlay = () => {
    setErrorOverlay((current) => ({ ...current, visible: false }));
  };

  const dismissMentions = () => {
    setMentionsBanner([]);
    sendWs({ type: "mark-mentions-read" });
  };

  const resetChatUnread = () => {
    setChatUnread(0);
  };

  const resetSessionRealtime = () => {
    setChatEntries([]);
    setMentionsBanner([]);
    dismissErrorOverlay();
  };

  useEffect(() => {
    if (!enabled) return;

    let isActive = true;
    let reconnectTimer: number | null = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = socket;

      let pingInterval: number | null = null;

      socket.onopen = () => {
        if (!isActive) return;
        setWsConnected(true);
        pingInterval = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
        }, 30000);
        const urlSession = new URL(window.location.href).searchParams.get("s");
        socketOpenRef.current(urlSession);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "me":
            setCurrentUser(data.user || null);
            break;
          case "projects":
            projectsUpdateRef.current(data.projects || [], data.sessions || []);
            break;
          case "sessions":
            sessionsUpdateRef.current(data.sessions || []);
            break;
          case "output":
            terminalRef.current?.writeOutput(data.data);
            break;
          case "chat":
            appendChatEntry({ type: "chat", name: data.name, text: data.text, timestamp: data.timestamp });
            break;
          case "system":
            appendSystem(data.text);
            if (data.text?.includes("process exited")) {
              setErrorOverlay({
                visible: true,
                title: "Claude process exited",
                description:
                  "The Claude session has ended. This can happen if there was an error during startup or the process crashed. You can start a fresh session to try again.",
                showNewSession: true,
              });
            } else if (data.text?.includes("Session closed")) {
              setErrorOverlay({
                visible: true,
                title: "Session closed",
                description: "This session has been shut down. Start a new session to continue.",
                showNewSession: true,
              });
            }
            break;
          case "users":
            setConnectedUsers(data.users || []);
            usersUpdateRef.current(data.users || []);
            break;
          case "mention":
            if (
              data.mentioned &&
              myNameRef.current &&
              data.mentioned.toLowerCase() === myNameRef.current.toLowerCase() &&
              document.hidden &&
              notificationPermissionRef.current === "granted"
            ) {
              const preview = data.text.length > 80 ? `${data.text.slice(0, 80)}...` : data.text;
              const notification = new Notification(`${data.from} mentioned you in Jam`, {
                body: preview,
                icon: `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#0d1117'/><text x='32' y='42' text-anchor='middle' font-size='32' fill='#ff9a56'>@</text></svg>")}`,
                tag: `jam-mention-${Date.now()}`,
                requireInteraction: true,
              });

              notification.onclick = () => {
                window.focus();
                notification.close();
                if (data.sessionId && data.sessionId !== currentSessionIdRef.current) {
                  joinSessionRef.current?.(data.sessionId);
                }
              };
            }
            break;
          case "unread-mentions":
            if (data.mentions?.length) {
              setMentionsBanner(data.mentions);
              setChatCollapsed(false);
            }
            break;
          case "pong":
            break;
        }
      };

      socket.onclose = () => {
        if (pingInterval) window.clearInterval(pingInterval);
        if (!isActive) return;
        setWsConnected(false);
        socketDisconnectRef.current();
        setConnectedUsers([]);
        terminalRef.current?.handleDisconnect();
        stopPollingRef.current();
        appendSystem("Disconnected. Reconnecting...");
        reconnectTimer = window.setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      isActive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      stopPollingRef.current();
    };
  }, [enabled, terminalRef]);

  return {
    appendSystem,
    chatCollapsed,
    chatEntries,
    chatUnread,
    connectedUsers,
    currentUser,
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
  };
}
