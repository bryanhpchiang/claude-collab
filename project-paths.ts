import { isAbsolute, resolve } from "path";

interface ResolveProjectCwdOptions {
  defaultCwd: string;
  baseDir?: string;
  homeDir?: string;
}

export function resolveProjectCwd(
  input: string | undefined,
  {
    defaultCwd,
    baseDir = process.env.HOME || "/root",
    homeDir = process.env.HOME || "/root",
  }: ResolveProjectCwdOptions,
): string {
  const cwd = input?.trim();

  if (!cwd) return defaultCwd;
  if (cwd === "~") return homeDir;
  if (cwd.startsWith("~/")) return resolve(homeDir, cwd.slice(2));
  if (isAbsolute(cwd)) return cwd;

  return resolve(baseDir, cwd);
}
