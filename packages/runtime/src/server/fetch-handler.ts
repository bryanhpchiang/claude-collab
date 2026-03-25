import { handleAuthRoute } from "./routes/auth";
import { handleInvitesRoute } from "./routes/invites";
import { handleProjectsRoute } from "./routes/projects";
import { handleSecretsRoute } from "./routes/secrets";
import { handleSessionsRoute } from "./routes/sessions";
import { handleStaticRoute } from "./routes/static";
import { handleSystemRoute } from "./routes/system";
import { serveOgImage } from "shared";
import { buildCoordinationGateUrl, getAuthenticatedUser } from "./runtime-auth";
import type { RuntimeStore } from "./runtime-store";

export function createFetchHandler(store: RuntimeStore) {
  return async function fetch(req: Request, server: Bun.Server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (server.upgrade(req, { data: { user } })) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    const authResponse = await handleAuthRoute(req, url);
    if (authResponse) return authResponse;

    if (url.pathname === "/og-image.svg" && req.method === "GET") {
      return serveOgImage();
    }

    if (url.pathname === "/health" || url.pathname === "/api/deploy") {
      const systemResponse = await handleSystemRoute(req, url, store);
      if (systemResponse) return systemResponse;
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return Response.redirect(buildCoordinationGateUrl(req), 302);
    }

    if (url.pathname === "/api/me" && req.method === "GET") {
      return Response.json(user);
    }

    const handlers = [
      (request: Request, nextUrl: URL) => handleInvitesRoute(request, nextUrl),
      (request: Request, nextUrl: URL, nextStore: RuntimeStore) =>
        handleProjectsRoute(request, nextUrl, nextStore),
      (request: Request, nextUrl: URL, nextStore: RuntimeStore) =>
        handleSessionsRoute(request, nextUrl, nextStore),
      (request: Request, nextUrl: URL, nextStore: RuntimeStore) =>
        handleSecretsRoute(request, nextUrl, nextStore, user),
      handleSystemRoute,
      (request: Request, nextUrl: URL, nextStore: RuntimeStore) =>
        handleStaticRoute(request, nextUrl, nextStore, user),
    ];

    for (const handler of handlers) {
      const response = await handler(req, url, store);
      if (response) return response;
    }

    return new Response("Not found", { status: 404 });
  };
}
