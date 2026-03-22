import { spawn } from "bun-pty";

const claudePath = "/home/exedev/.local/bin/claude";

console.log("Spawning claude at:", claudePath);

const shell = spawn(claudePath, ["--dangerously-skip-permissions"], {
  name: "xterm-256color",
  cols: 160,
  rows: 48,
  cwd: "/home/exedev",
  env: { ...process.env as Record<string, string>, TERM: "xterm-256color", HOME: "/home/exedev" },
});

console.log("Claude PTY spawned, pid:", shell.pid);

// Auto-accept the trust prompt after claude starts up
setTimeout(() => {
  console.log("Sending Enter to accept trust prompt...");
  shell.write("\r");
}, 3000);
setTimeout(() => {
  shell.write("\r");
}, 5000);

let scrollback = "";
const clients = new Map<any, { name: string }>();

function broadcastMsg(msg: object) {
  server.publish("terminal", JSON.stringify(msg));
}

function getUserList(): string[] {
  return [...clients.values()].map((c) => c.name);
}

const server = Bun.serve({
  port: 7681,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("public/index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("terminal");
      ws.send(JSON.stringify({ type: "output", data: scrollback }));
      ws.send(JSON.stringify({ type: "users", users: getUserList() }));
    },
    message(ws, msg) {
      try {
        const data = JSON.parse(msg as string);

        if (data.type === "join") {
          clients.set(ws, { name: data.name });
          broadcastMsg({ type: "system", text: `${data.name} joined` });
          broadcastMsg({ type: "users", users: getUserList() });
        }

        if (data.type === "input") {
          const client = clients.get(ws);
          const name = client?.name || "anon";
          broadcastMsg({ type: "chat", name, text: data.text });
          shell.write(data.text + "\r");
        }

        if (data.type === "key") {
          // Raw key sequences (escape, tab, ctrl+c, arrows, etc.)
          const client = clients.get(ws);
          const name = client?.name || "anon";
          broadcastMsg({ type: "system", text: `${name} pressed ${data.label || "key"}` });
          shell.write(data.seq);
        }
      } catch {}
    },
    close(ws) {
      const client = clients.get(ws);
      if (client) {
        clients.delete(ws);
        broadcastMsg({ type: "system", text: `${client.name} left` });
        broadcastMsg({ type: "users", users: getUserList() });
      }
    },
  },
});

shell.onData((data: string) => {
  scrollback += data;
  if (scrollback.length > 200000) {
    scrollback = scrollback.slice(-100000);
  }
  broadcastMsg({ type: "output", data });
});

shell.onExit(({ exitCode, signal }) => {
  console.log(`Claude exited: code=${exitCode} signal=${signal}`);
  broadcastMsg({
    type: "system",
    text: `Claude process exited (code ${exitCode}). Refresh to reconnect.`,
  });
});

console.log(`Claude Collab running on http://localhost:7681`);
