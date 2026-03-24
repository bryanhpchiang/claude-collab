import { join } from "path";
import { getStaticMimeType, WEB_DIR } from "../config";

function resolveAssetPath(pathname: string) {
  const relativePath = pathname.replace(/^\/assets\//, "");
  if (!relativePath) return null;
  const parts = relativePath.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return join(WEB_DIR, ...parts);
}

export async function renderRuntimeApp(jamSessionId?: string) {
  const html = await Bun.file(join(WEB_DIR, "index.html")).text();
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function serveRuntimeAsset(pathname: string) {
  const assetPath = resolveAssetPath(pathname);
  if (!assetPath) return null;
  const file = Bun.file(assetPath);
  if (!(await file.exists())) return null;
  return new Response(file, {
    headers: {
      "Content-Type": getStaticMimeType(assetPath),
    },
  });
}
