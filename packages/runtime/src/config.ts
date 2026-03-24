import { execSync } from "child_process";
import { join } from "path";

export const SRC_ROOT = import.meta.dir;
export const RUNTIME_ROOT = join(SRC_ROOT, "..");
export const WORKSPACE_ROOT = join(RUNTIME_ROOT, "..", "..");
export const WEB_DIR = join(SRC_ROOT, "web");

export const UPLOAD_DIR = "/tmp/claude-uploads";
export const HOME_DIR = process.env.HOME || "/root";
export const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude/projects");
export const DEFAULT_PROJECT_CWD = HOME_DIR;
export const DEFAULT_NEW_PROJECTS_DIR = join(HOME_DIR, "projects");
export const PORT = process.env.PORT === undefined ? 7681 : Number(process.env.PORT);
export const CLAUDE_PATH = process.env.CLAUDE_PATH || execSync("which claude").toString().trim();

const STATIC_MIME_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
};

export function getStaticMimeType(pathname: string): string {
  const extension = pathname.split(".").pop() || "";
  return STATIC_MIME_TYPES[extension] || "application/octet-stream";
}
