import type { CoordinationConfig } from "../config";
import {
  buildGitHubAuthorizeUrl,
  createSessionToken,
  exchangeCodeForSessionUser,
  getSecureCookieAttribute,
  getSessionUser,
  isGitHubOAuthEnabled,
  parseCookies,
  type SessionStore,
} from "../services/github-oauth";

type AuthRouteContext = {
  config: CoordinationConfig;
  sessions: SessionStore;
};

function apiHeaders(extra: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
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

    return Response.redirect(buildGitHubAuthorizeUrl(context.config, request), 302);
  }

  if (url.pathname === "/auth/github/callback") {
    if (!isGitHubOAuthEnabled(context.config)) {
      return new Response("GitHub OAuth is not configured", { status: 503 });
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return new Response("Missing code", { status: 400 });
    }

    try {
      const user = await exchangeCodeForSessionUser(context.config, code);
      const token = createSessionToken();
      context.sessions.set(token, user);

      return new Response(null, {
        status: 302,
        headers: {
          Location: "/dashboard",
          "Set-Cookie": `jam_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${getSecureCookieAttribute(context.config, request)}`,
        },
      });
    } catch (error: any) {
      console.error("OAuth callback error:", error);
      return new Response(`OAuth error: ${error.message}`, { status: 500 });
    }
  }

  if (url.pathname === "/auth/logout") {
    const token = parseCookies(request.headers.get("cookie")).jam_session;
    if (token) context.sessions.delete(token);

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": `jam_session=; Path=/; HttpOnly; Max-Age=0${getSecureCookieAttribute(context.config, request)}`,
      },
    });
  }

  if (url.pathname === "/api/me") {
    const user = getSessionUser(request, context.sessions);
    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: apiHeaders() },
      );
    }

    return Response.json(user, { headers: apiHeaders() });
  }
}
