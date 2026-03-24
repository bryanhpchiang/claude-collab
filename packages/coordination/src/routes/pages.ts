import { basename, join } from "path";
import type { CoordinationConfig } from "../config";
import {
  getSessionLookup,
  isGitHubOAuthEnabled,
  type CoordinationAuth,
} from "../services/auth";
import type { Ec2Service } from "../services/ec2";
import { mergeHeaders } from "../services/http";
import type { JamRecordsService } from "../services/jam-records";
import { renderDashboardPage } from "../views/dashboard";
import { renderLandingPage } from "../views/landing";
import { listJams } from "./jams";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

type PageRouteContext = {
  config: CoordinationConfig;
  auth: CoordinationAuth;
  jamRecords: JamRecordsService;
  ec2: Ec2Service;
};

function getContentType(pathname: string) {
  const match = pathname.match(/\.[a-z0-9]+$/i);
  return match ? MIME_TYPES[match[0]] || "application/octet-stream" : "application/octet-stream";
}

export async function handlePageRoutes(
  request: Request,
  context: PageRouteContext,
) {
  const url = new URL(request.url);

  if (url.pathname === "/" && request.method === "GET") {
    const session = await getSessionLookup(request, context.auth);
    const user = session.user;
    if (user) {
      return new Response(null, {
        status: 302,
        headers: mergeHeaders(session.headers, { Location: "/dashboard" }),
      });
    }

    return new Response(
      renderLandingPage({
        signedIn: false,
        authEnabled: isGitHubOAuthEnabled(context.config),
      }),
      {
        headers: mergeHeaders(session.headers, {
          "Content-Type": "text/html; charset=utf-8",
        }),
      },
    );
  }

  if (url.pathname === "/dashboard" && request.method === "GET") {
    const session = await getSessionLookup(request, context.auth);
    const user = session.user;
    if (!user) {
      return new Response(null, {
        status: 302,
        headers: mergeHeaders(session.headers, {
          Location: isGitHubOAuthEnabled(context.config) ? "/auth/github" : "/",
        }),
      });
    }

    const jams = await listJams(context);
    return new Response(renderDashboardPage({ user, jams }), {
      headers: mergeHeaders(session.headers, {
        "Content-Type": "text/html; charset=utf-8",
      }),
    });
  }

  if (url.pathname.startsWith("/static/") && request.method === "GET") {
    const requested = url.pathname.slice("/static/".length);
    if (!requested || requested.includes("..") || basename(requested) !== requested) {
      return new Response("Bad request", { status: 400 });
    }

    const file = Bun.file(join(context.config.staticDir, requested));
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file, {
      headers: { "Content-Type": getContentType(requested) },
    });
  }
}
