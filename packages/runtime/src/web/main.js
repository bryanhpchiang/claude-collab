import { createChatController } from "./features/chat.js";
import { createMentionController } from "./features/mentions.js";
import { createStateSidebarController } from "./features/state-sidebar.js";
import { createTerminalController } from "./features/terminal.js";
import { initTreats } from "./features/treats.js";
import { initUserController } from "./features/user.js";
import { createWorkspaceController } from "./features/workspace.js";

const DEFAULT_SESSION_SENTINEL = "__default__";

const state = {
  ws: null,
  myName: "",
  currentSessionId: null,
  sessionList: [],
  pendingJoin: null,
  projectList: [],
  currentProjectId: null,
  connectedUsers: [],
  notificationPermission: "default",
};

function canSend() {
  return state.ws && state.ws.readyState === WebSocket.OPEN;
}

function sendWs(message) {
  if (!canSend()) return false;
  state.ws.send(JSON.stringify(message));
  return true;
}

async function createFreshSession() {
  const name = `Session ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const url = state.currentProjectId ? `/api/projects/${state.currentProjectId}/sessions` : "/api/sessions";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, projectId: state.currentProjectId }),
  });
  return response.json();
}

const terminal = createTerminalController({
  state,
  onTtyInput(data) {
    sendWs({ type: "tty-input", data });
  },
});

const sidebar = createStateSidebarController({ state });

const chat = createChatController({
  state,
  onSendMessage(text, direct) {
    sendWs({ type: "input", text, direct });
  },
  onSendKey(seq, label) {
    sendWs({ type: "key", seq, label });
  },
  onCreateFreshSession: createFreshSession,
  onJoinSession: joinSession,
  onLayoutChange() {
    terminal.fit();
  },
  onMarkMentionsRead() {
    sendWs({ type: "mark-mentions-read" });
  },
});

function showLobby() {
  state.currentSessionId = null;
  document.body.classList.add("in-lobby");
  terminal.hideOauthModal();
  terminal.setInteractiveMode(false);
  chat.setInputEnabled(false);
  sidebar.resetSummary();
}

const workspace = createWorkspaceController({
  state,
  onJoinSession: joinSession,
  onShowLobby: showLobby,
  onLayoutChange() {
    terminal.fit();
  },
});

createMentionController({ state });

initTreats({
  state,
  onAnnounce(text) {
    chat.addSystem(text);
  },
});

function maybeShowMentionNotification(message) {
  if (
    !message.mentioned ||
    !state.myName ||
    message.mentioned.toLowerCase() !== state.myName.toLowerCase() ||
    document.hidden === false ||
    state.notificationPermission !== "granted"
  ) {
    return;
  }

  const preview = message.text.length > 80 ? `${message.text.slice(0, 80)}...` : message.text;
  const notification = new Notification(`${message.from} mentioned you in Jam`, {
    body: preview,
    icon: `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#0d1117'/><text x='32' y='42' text-anchor='middle' font-size='32' fill='#ff9a56'>@</text></svg>")}`,
    tag: `jam-mention-${Date.now()}`,
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    if (message.sessionId && message.sessionId !== state.currentSessionId) {
      joinSession(message.sessionId);
    }
  };
}

function selectPendingSession() {
  if (!state.pendingJoin) return;

  if (state.pendingJoin === DEFAULT_SESSION_SENTINEL) {
    const filtered = state.sessionList.filter((session) => session.projectId === state.currentProjectId);
    const fallback = filtered.find((session) => session.name === "General") || filtered[0];
    if (fallback) joinSession(fallback.id);
  } else if (state.sessionList.find((session) => session.id === state.pendingJoin)) {
    const target = state.sessionList.find((session) => session.id === state.pendingJoin);
    if (target?.projectId) state.currentProjectId = target.projectId;
    workspace.renderProjectTabs();
    workspace.renderSessionTabs();
    joinSession(state.pendingJoin);
  }

  state.pendingJoin = null;
}

function joinSession(sessionId) {
  if (!sessionId || state.currentSessionId === sessionId) return;

  state.currentSessionId = sessionId;
  const targetSession = state.sessionList.find((session) => session.id === sessionId);
  if (targetSession?.projectId && targetSession.projectId !== state.currentProjectId) {
    state.currentProjectId = targetSession.projectId;
    workspace.renderProjectTabs();
  }

  terminal.resetForSession();
  chat.resetSessionView();
  sidebar.resetSummary();
  sendWs({ type: "join-session", sessionId, name: state.myName });

  const nextUrl = new URL(location.href);
  nextUrl.searchParams.set("s", sessionId);
  history.replaceState(null, "", nextUrl);

  workspace.renderSessionTabs();
  setTimeout(() => terminal.fit(), 50);
  sidebar.fetchStateSummary();
  sidebar.startPolling();
}

function handleProjectsMessage(message) {
  state.projectList = message.projects || [];
  state.sessionList = message.sessions || [];
  if (!state.currentProjectId && state.projectList.length > 0) {
    state.currentProjectId = state.projectList[0].id;
  }
  workspace.renderProjectTabs();
  workspace.renderSessionTabs();
  selectPendingSession();
}

function handleSessionsMessage(message) {
  state.sessionList = message.sessions || [];
  workspace.renderSessionTabs();
  selectPendingSession();
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  state.ws = new WebSocket(`${protocol}//${location.host}/ws`);

  state.ws.onopen = () => {
    const urlSession = new URL(location.href).searchParams.get("s");
    state.pendingJoin = urlSession || DEFAULT_SESSION_SENTINEL;
  };

  state.ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case "projects":
        handleProjectsMessage(message);
        break;
      case "sessions":
        handleSessionsMessage(message);
        break;
      case "output":
        terminal.writeOutput(message.data);
        break;
      case "chat":
        chat.addChat(message.name, message.text);
        break;
      case "system":
        chat.addSystem(message.text);
        if (message.text?.includes("process exited")) {
          chat.showErrorOverlay(
            "Claude process exited",
            "The Claude session has ended. This can happen if there was an error during startup or the process crashed. You can start a fresh session to try again.",
            true,
          );
        } else if (message.text?.includes("Session closed")) {
          chat.showErrorOverlay(
            "Session closed",
            "This session has been shut down. Start a new session to continue.",
            true,
          );
        }
        break;
      case "users":
        chat.updateUsers(message.users);
        if (state.currentSessionId) {
          const session = state.sessionList.find((entry) => entry.id === state.currentSessionId);
          if (session) session.users = message.users;
          workspace.renderSessionTabs();
        }
        break;
      case "mention":
        maybeShowMentionNotification(message);
        break;
      case "unread-mentions":
        if (message.mentions?.length) chat.showMentionsBanner(message.mentions);
        break;
    }
  };

  state.ws.onclose = () => {
    chat.setInputEnabled(false);
    terminal.handleDisconnect();
    sidebar.stopPolling();
    chat.addSystem("Disconnected. Reconnecting...");
    setTimeout(connect, 2000);
  };

  state.ws.onerror = () => {
    state.ws.close();
  };
}

initUserController({
  state,
  onConnect: connect,
  onRenameInSession(name) {
    if (!state.currentSessionId) return;
    sendWs({ type: "join-session", sessionId: state.currentSessionId, name });
  },
  onSendKey(seq) {
    sendWs({ type: "key", seq });
  },
});
