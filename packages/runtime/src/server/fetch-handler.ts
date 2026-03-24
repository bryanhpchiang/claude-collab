import { handleProjectsRoute } from "./routes/projects";
import { handleSecretsRoute } from "./routes/secrets";
import { handleSessionsRoute } from "./routes/sessions";
import { handleStaticRoute } from "./routes/static";
import { handleSystemRoute } from "./routes/system";
import type { RuntimeStore } from "./runtime-store";

export function createFetchHandler(store: RuntimeStore) {
  return async function fetch(req: Request, server: Bun.Server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    const handlers = [
      handleProjectsRoute,
      handleSessionsRoute,
      handleSecretsRoute,
      handleSystemRoute,
      handleStaticRoute,
    ];

    for (const handler of handlers) {
      const response = await handler(req, url, store);
      if (response) return response;
    }

    return new Response("Not found", { status: 404 });
  };
}
