import type { CoordinationConfig } from "../config";
import {
  isGitHubOAuthEnabled,
  getSessionLookup,
  normalizeAuthCallback,
  startGitHubSignIn,
  signOutAndRedirect,
  type CoordinationAuth,
} from "../services/auth";
import { mergeHeaders } from "../services/http";

type AuthRouteContext = {
  config: CoordinationConfig;
  auth: CoordinationAuth;
};

function apiHeaders(extra: HeadersInit = {}) {
  return mergeHeaders({
    "Access-Control-Allow-Origin": "*",
  }, extra);
}

export async function handleAuthRoutes(
  request: Request,
  context: AuthRouteContext,
) {
  const url = new URL(request.url);

  if (url.pathname === "/auth/github") {
    if (!isGitHubOAuthEnabled(context.config)) {
      return new Response("GitHub OAuth is not configured", { status: 503 });
    }

    return startGitHubSignIn(
      request,
      context.auth,
      normalizeAuthCallback(url.searchParams.get("callback")),
    );
  }

  if (url.pathname.startsWith("/api/auth/")) {
    return context.auth.handler(request);
  }

  if (url.pathname === "/auth/logout") {
    return signOutAndRedirect(request, context.auth);
  }

  if (url.pathname === "/api/me") {
    const session = await getSessionLookup(request, context.auth);
    const user = session.user;
    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: apiHeaders(session.headers) },
      );
    }

    return Response.json(user, { headers: apiHeaders(session.headers) });
  }
}
