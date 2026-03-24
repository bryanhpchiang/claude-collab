import { mkdir } from "fs/promises";
import type { RuntimeStore } from "../runtime-store";

export async function handleProjectsRoute(req: Request, url: URL, store: RuntimeStore) {
  if (url.pathname === "/api/projects") {
    if (req.method === "GET") return Response.json(store.listProjects());

    if (req.method === "POST") {
      const body = (await req.json()) as { name?: string; cwd?: string };
      const project = store.createWorkspaceProject(body.name || "Untitled", body.cwd);
      await mkdir(project.cwd, { recursive: true });
      const defaultSession = store.createSession("General", project.id);
      store.broadcastLobby();
      return Response.json({
        id: project.id,
        name: project.name,
        cwd: project.cwd,
        defaultSessionId: defaultSession.id,
      });
    }
  }

  const deleteMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const projectId = deleteMatch[1];
    if (store.projectCount() <= 1) {
      return Response.json({ error: "cannot delete last project" }, { status: 400 });
    }
    const project = store.getProject(projectId);
    if (!project) return Response.json({ error: "not found" }, { status: 404 });
    store.removeProject(projectId);
    store.broadcastLobby();
    return Response.json({ ok: true });
  }

  const sessionMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9]+)\/sessions$/);
  if (sessionMatch && req.method === "POST") {
    const projectId = sessionMatch[1];
    const project = store.getProject(projectId);
    if (!project) return Response.json({ error: "project not found" }, { status: 404 });
    const body = (await req.json()) as { name?: string; resumeId?: string };
    const session = store.createSession(body.name || "Untitled", projectId, body.resumeId);
    store.broadcastLobby();
    return Response.json({ id: session.id, name: session.name, projectId });
  }

  return null;
}
