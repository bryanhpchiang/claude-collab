import { basename, join } from "path";
import {
  resolveViteEntryAssets,
  type ViteManifest,
} from "shared";
import {
  getStaticMimeType,
  WEB_CLIENT_ENTRY,
  WEB_DEV_SERVER_URL,
  WEB_DIST_DIR,
  WEB_MANIFEST_PATH,
} from "../config";

let manifestCache: ViteManifest | null | undefined;

export async function getRuntimeWebAssets() {
  const devServerUrl = WEB_DEV_SERVER_URL.replace(/\/$/, "");
  if (devServerUrl) {
    return {
      styles: [] as string[],
      scripts: [`${devServerUrl}/@vite/client`, `${devServerUrl}/${WEB_CLIENT_ENTRY}`],
    };
  }

  const manifestFile = Bun.file(WEB_MANIFEST_PATH);
  if (!(await manifestFile.exists())) {
    return { styles: [] as string[], scripts: [] as string[] };
  }

  manifestCache ||= (await manifestFile.json()) as ViteManifest;
  const entryAssets = resolveViteEntryAssets(manifestCache, WEB_CLIENT_ENTRY);
  if (!entryAssets) return { styles: [] as string[], scripts: [] as string[] };

  return {
    styles: entryAssets.styles.map((asset) => `/${asset}`),
    scripts: [`/${entryAssets.script}`],
  };
}

export async function serveRuntimeAsset(pathname: string) {
  if (!pathname.startsWith("/assets/")) return null;

  const requested = pathname.slice(1);
  if (!requested || requested.includes("..") || basename(requested) === requested) {
    return new Response("Bad request", { status: 400 });
  }

  const file = Bun.file(join(WEB_DIST_DIR, requested));
  if (!(await file.exists())) return null;

  return new Response(file, {
    headers: { "Content-Type": getStaticMimeType(requested) },
  });
}
