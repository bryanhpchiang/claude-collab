import { renderRuntimeApp } from "../static-app";
import type { RuntimeStore } from "../runtime-store";
import type { AuthenticatedRuntimeUser } from "../runtime-auth";
import { serveRuntimeAsset } from "../web-assets";

export async function handleStaticRoute(
  req: Request,
  url: URL,
  store: RuntimeStore,
  user: AuthenticatedRuntimeUser | null,
) {
  if (req.method !== "GET" && req.method !== "HEAD") return null;

  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/app") {
    return renderRuntimeApp(user, url.searchParams.get("s") || undefined);
  }

  if (url.pathname.startsWith("/assets/")) {
    return serveRuntimeAsset(url.pathname);
  }

  return null;
}
