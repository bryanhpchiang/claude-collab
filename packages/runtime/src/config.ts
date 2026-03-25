import { execSync } from "child_process";
import { join } from "path";

export const SRC_ROOT = import.meta.dir;
export const RUNTIME_ROOT = join(SRC_ROOT, "..");
export const WORKSPACE_ROOT = join(RUNTIME_ROOT, "..", "..");
export const WEB_SRC_DIR = join(SRC_ROOT, "web");
export const WEB_DIR = WEB_SRC_DIR;
export const WEB_DIST_DIR = join(RUNTIME_ROOT, "dist", "web");
export const WEB_MANIFEST_PATH = join(WEB_DIST_DIR, ".vite", "manifest.json");
export const WEB_CLIENT_ENTRY = "src/web/main.client.tsx";
export const WEB_DEV_SERVER_URL =
  process.env.RUNTIME_WEB_DEV_SERVER_URL ||
  process.env.WEB_DEV_SERVER_URL ||
  "";

export const UPLOAD_DIR = "/tmp/claude-uploads";
export const HOME_DIR = process.env.HOME || "/root";
export const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude/projects");
export const DEFAULT_PROJECT_CWD = HOME_DIR;
export const DEFAULT_NEW_PROJECTS_DIR = join(HOME_DIR, "projects");
export const PORT = process.env.PORT === undefined ? 7681 : Number(process.env.PORT);
export const CLAUDE_PATH = process.env.CLAUDE_PATH || execSync("which claude").toString().trim();
export const JAM_ID = process.env.JAM_ID || "";
export const JAM_NAME = process.env.JAM_NAME || "";
export const JAM_PUBLIC_HOST = process.env.JAM_PUBLIC_HOST || "";
export const JAM_SHARED_SECRET = process.env.JAM_SHARED_SECRET || "";
export const JAM_DEPLOY_SECRET = process.env.JAM_DEPLOY_SECRET || "";
export const COORDINATION_BASE_URL = process.env.COORDINATION_BASE_URL || "https://letsjam.now";

const STATIC_MIME_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  map: "application/json; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  woff2: "font/woff2",
};

export function getStaticMimeType(pathname: string): string {
  const extension = pathname.split(".").pop() || "";
  return STATIC_MIME_TYPES[extension] || "application/octet-stream";
}
