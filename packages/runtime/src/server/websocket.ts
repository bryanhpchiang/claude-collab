import type { RuntimeStore } from "./runtime-store";

export function createWebSocketHandler(store: RuntimeStore) {
  return {
    open(ws: any) {
      ws.subscribe("lobby");
      ws.send(
        JSON.stringify({
          type: "projects",
          projects: store.listProjects(),
          sessions: store.listSessions(),
        }),
      );
    },

    message(ws: any, message: string | Buffer) {
      try {
        const data = JSON.parse(String(message));

        if (data.type === "join-session") {
          const session = store.getSession(data.sessionId);
          if (!session) return;

          const oldSessionId = store.getClientSession(ws);
          const oldInfo = store.getClientInfo(ws);
          if (oldSessionId === data.sessionId) {
            store.setClientConnection(ws, data.sessionId, data.name);
            if (oldInfo?.name && oldInfo.name !== data.name) {
              store.broadcastSystem(data.sessionId, `${oldInfo.name} is now ${data.name}`);
            }
            store.broadcastUsers(data.sessionId);
            return;
          }

          if (oldSessionId) {
            ws.unsubscribe(`session:${oldSessionId}`);
            if (oldInfo) {
              store.broadcastSystem(oldSessionId, `${oldInfo.name} left`);
              store.broadcastUsers(oldSessionId);
            }
          }

          store.setClientConnection(ws, data.sessionId, data.name);
          ws.subscribe(`session:${data.sessionId}`);
          ws.send(JSON.stringify({ type: "output", data: session.scrollback }));
          ws.send(JSON.stringify({ type: "users", users: store.getSessionUsers(data.sessionId) }));
          for (const entry of session.chatHistory) {
            ws.send(JSON.stringify(entry));
          }
          store.broadcastSystem(data.sessionId, `${data.name} joined`);
          store.broadcastUsers(data.sessionId);

          const pending = store.getPendingMentions(data.name);
          if (pending.length > 0) {
            ws.send(JSON.stringify({ type: "unread-mentions", mentions: pending }));
            store.clearPendingMentions(data.name);
          }
          return;
        }

        if (data.type === "input") {
          const sessionId = store.getClientSession(ws);
          const info = store.getClientInfo(ws);
          if (!sessionId || !info) return;
          store.handleChatInput(sessionId, info.name, data.text, Boolean(data.direct));
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
          store.handleKeyInput(sessionId, info.name, data.seq, data.label);
          return;
        }

        if (data.type === "mark-mentions-read") {
          const info = store.getClientInfo(ws);
          if (info) store.clearPendingMentions(info.name);
        }
      } catch {}
    },

    close(ws: any) {
      const sessionId = store.getClientSession(ws);
      const info = store.getClientInfo(ws);
      if (sessionId && info) {
        ws.unsubscribe(`session:${sessionId}`);
        store.clearClientConnection(ws);
        store.broadcastSystem(sessionId, `${info.name} left`);
        store.broadcastUsers(sessionId);
      }
      ws.unsubscribe("lobby");
    },
  };
}
