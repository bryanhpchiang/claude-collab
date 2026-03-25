import type { CoordinationConfig } from "../config";
import {
  getSessionLookup,
  isGitHubOAuthEnabled,
  type CoordinationAuth,
} from "../services/auth";
import type { Ec2Service } from "../services/ec2";
import { mergeHeaders } from "../services/http";
import type { JamAccessService } from "../services/jam-access";
import type { JamRecordsService } from "../services/jam-records";
import { renderCoordinationPage } from "../server/web-render";
import { serveCoordinationAsset } from "../server/web-assets";
import { listJamsForUser } from "./jams";
import { OG_IMAGE_PATH } from "shared";
import { serveOgImage } from "shared/src/og-image";

type PageRouteContext = {
  config: CoordinationConfig;
  auth: CoordinationAuth;
  jamRecords: JamRecordsService;
  jamAccess: JamAccessService;
  ec2: Ec2Service;
};

export async function handlePageRoutes(
  request: Request,
  context: PageRouteContext,
) {
  const url = new URL(request.url);

  if (url.pathname === OG_IMAGE_PATH && request.method === "GET") {
    return serveOgImage();
  }

  if (url.pathname === "/" && request.method === "GET") {
    const session = await getSessionLookup(request, context.auth);
    const user = session.user;
    if (user) {
      return new Response(null, {
        status: 302,
        headers: mergeHeaders(session.headers, { Location: "/dashboard" }),
      });
    }

    return new Response(await renderCoordinationPage(context.config, {
      bootstrap: {
        page: "landing",
        signedIn: false,
        authEnabled: isGitHubOAuthEnabled(context.config),
      },
    }), {
      headers: mergeHeaders(session.headers, {
        "Content-Type": "text/html; charset=utf-8",
      }),
    });
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

    const jams = await listJamsForUser(context, user.id);
    return new Response(await renderCoordinationPage(context.config, {
      bootstrap: {
        page: "dashboard",
        user,
        jams,
      },
    }), {
      headers: mergeHeaders(session.headers, {
        "Content-Type": "text/html; charset=utf-8",
      }),
    });
  }

  if (url.pathname.startsWith("/assets/") && request.method === "GET") {
    return serveCoordinationAsset(url.pathname, context.config);
  }
}
