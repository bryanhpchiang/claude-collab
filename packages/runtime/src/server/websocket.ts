import type { RuntimeStore } from "./runtime-store";
import type { AuthenticatedRuntimeUser } from "./types";

type AuthenticatedSocket = {
  data?: {
    user?: AuthenticatedRuntimeUser;
  };
  send(payload: string): void;
  subscribe(channel: string): void;
  unsubscribe(channel: string): void;
};

function getSocketUser(ws: AuthenticatedSocket) {
  return ws.data?.user;
}

export function createWebSocketHandler(store: RuntimeStore) {
  return {
    open(ws: AuthenticatedSocket) {
      const user = getSocketUser(ws);
      if (!user) return;

      ws.subscribe("lobby");
      ws.send(JSON.stringify({ type: "me", user }));
      ws.send(
        JSON.stringify({
          type: "projects",
          projects: store.listProjects(),
          sessions: store.listSessions(),
        }),
      );
    },

    message(ws: AuthenticatedSocket, message: string | Buffer) {
      const user = getSocketUser(ws);
      if (!user) return;

      try {
        const data = JSON.parse(String(message));

        if (data.type === "join-session") {
          const session = store.getSession(data.sessionId);
          if (!session) return;

          const oldSessionId = store.getClientSession(ws);
          const oldInfo = store.getClientInfo(ws);
          if (oldSessionId === data.sessionId) {
            store.setClientConnection(ws, data.sessionId, user);
            store.broadcastUsers(data.sessionId);
            return;
          }

          if (oldSessionId) {
            ws.unsubscribe(`session:${oldSessionId}`);
            if (oldInfo) {
              store.broadcastSystem(oldSessionId, `${oldInfo.user.login} left`);
              store.broadcastUsers(oldSessionId);
            }
          }

          store.setClientConnection(ws, data.sessionId, user);
          ws.subscribe(`session:${data.sessionId}`);
          ws.send(JSON.stringify({ type: "output", data: session.scrollback }));
          ws.send(JSON.stringify({ type: "users", users: store.getSessionUsers(data.sessionId) }));
          for (const entry of session.chatHistory) {
            ws.send(JSON.stringify(entry));
          }
          store.broadcastSystem(data.sessionId, `${user.login} joined`);
          store.broadcastUsers(data.sessionId);

          const pending = store.getPendingMentions(user.login);
          if (pending.length > 0) {
            ws.send(JSON.stringify({ type: "unread-mentions", mentions: pending }));
            store.clearPendingMentions(user.login);
          }
          return;
        }

        if (data.type === "input") {
          const sessionId = store.getClientSession(ws);
          const info = store.getClientInfo(ws);
          if (!sessionId || !info) return;
          store.handleChatInput(sessionId, info.user.login, data.text, Boolean(data.direct));
          return;
        }

        if (data.type === "tty-input") {
          const sessionId = store.getClientSession(ws);
          if (!sessionId || typeof data.data !== "string") return;
          store.handleTtyInput(sessionId, data.data);
          return;
        }

        if (data.type === "key") {
          const sessionId = store.getClientSession(ws);
          const info = store.getClientInfo(ws);
          if (!sessionId || !info) return;
          store.handleKeyInput(sessionId, info.user.login, data.seq, data.label);
          return;
        }

        if (data.type === "mark-mentions-read") {
          store.clearPendingMentions(user.login);
          return;
        }

        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch {}
    },

    close(ws: AuthenticatedSocket) {
      const sessionId = store.getClientSession(ws);
      const info = store.getClientInfo(ws);
      if (sessionId && info) {
        ws.unsubscribe(`session:${sessionId}`);
        store.clearClientConnection(ws);
        store.broadcastSystem(sessionId, `${info.user.login} left`);
        store.broadcastUsers(sessionId);
      }
      ws.unsubscribe("lobby");
    },
  };
}
