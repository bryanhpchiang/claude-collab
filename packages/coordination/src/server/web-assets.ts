import { basename, join } from "path";
import {
  resolveViteEntryAssets,
  type ViteManifest,
} from "shared";
import type { CoordinationConfig } from "../config";
import {
  COORDINATION_WEB_CLIENT_ENTRIES,
} from "../web/bootstrap";
import type { CoordinationPage } from "../web/types";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
};

let manifestCache: ViteManifest | null | undefined;

function getContentType(pathname: string) {
  const match = pathname.match(/\.[a-z0-9]+$/i);
  return match ? MIME_TYPES[match[0]] || "application/octet-stream" : "application/octet-stream";
}

export async function getCoordinationWebAssets(
  config: CoordinationConfig,
  page: CoordinationPage,
) {
  const entryName = config.webClientEntries?.[page] || COORDINATION_WEB_CLIENT_ENTRIES[page];
  const devServerUrl = config.webDevServerUrl?.replace(/\/$/, "") || "";
  if (devServerUrl) {
    return {
      styles: [] as string[],
      scripts: [`${devServerUrl}/@vite/client`, `${devServerUrl}/${entryName}`],
    };
  }

  const manifestPath = config.webManifestPath || join(config.staticDir, ".vite", "manifest.json");
  const manifestFile = Bun.file(manifestPath);
  if (!(await manifestFile.exists())) {
    return { styles: [] as string[], scripts: [] as string[] };
  }

  manifestCache ||= (await manifestFile.json()) as ViteManifest;
  const entryAssets = resolveViteEntryAssets(manifestCache, entryName);
  if (!entryAssets) return { styles: [] as string[], scripts: [] as string[] };

  return {
    styles: entryAssets.styles.map((asset) => `/${asset}`),
    scripts: [`/${entryAssets.script}`],
  };
}

export async function serveCoordinationAsset(pathname: string, config: CoordinationConfig) {
  if (!pathname.startsWith("/assets/")) return null;

  const requested = pathname.slice(1);
  if (!requested || requested.includes("..") || basename(requested) === requested) {
    return new Response("Bad request", { status: 400 });
  }

  const file = Bun.file(join(config.staticDir, requested));
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    headers: { "Content-Type": getContentType(requested) },
  });
}
