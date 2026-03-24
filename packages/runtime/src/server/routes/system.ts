import { RUNTIME_ROOT } from "../../config";
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


  return null;
}
