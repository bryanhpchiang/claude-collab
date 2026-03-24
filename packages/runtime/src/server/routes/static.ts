import { renderRuntimeApp, serveRuntimeAsset } from "../static-app";
import type { RuntimeStore } from "../runtime-store";

export async function handleStaticRoute(req: Request, url: URL, store: RuntimeStore) {
  if (req.method !== "GET" && req.method !== "HEAD") return null;

  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/app") {
    return renderRuntimeApp();
  }

  if (url.pathname.startsWith("/assets/")) {
    return serveRuntimeAsset(url.pathname);
  }

  return null;
}
