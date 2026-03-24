import { RUNTIME_ROOT, WORKSPACE_ROOT } from "../../config";
import type { RuntimeStore } from "../runtime-store";

export async function handleSystemRoute(req: Request, url: URL, store: RuntimeStore) {
  if (url.pathname === "/api/state-summary" && req.method === "GET") {
    return Response.json(store.buildStateSummary());
  }

  if (url.pathname === "/api/restart" && req.method === "POST") {
    setTimeout(() => {
      const child = Bun.spawn([`${process.env.HOME}/.bun/bin/bun`, "run", "start"], {
        cwd: RUNTIME_ROOT,
        stdio: ["ignore", "ignore", "ignore"],
        env: process.env,
      });
      child.unref();
      process.exit(0);
    }, 500);
    return Response.json({ ok: true });
  }

  if (url.pathname === "/api/deploy" && req.method === "POST") {
    try {
      const proc = Bun.spawn(["git", "pull", "origin", "main"], {
        cwd: WORKSPACE_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      return Response.json({ ok: exitCode === 0, stdout, stderr, exitCode });
    } catch (error: any) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return null;
}
