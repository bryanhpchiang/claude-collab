import type { RuntimeStore } from "../runtime-store";

export async function handleSessionsRoute(req: Request, url: URL, store: RuntimeStore) {
  if (url.pathname === "/api/disk-sessions") {
    return Response.json(await store.getDiskSessions());
  }

  if (url.pathname === "/api/upload-image" && req.method === "POST") {
    try {
      const formData = await req.formData();
      const file = formData.get("image");
      if (!(file instanceof File)) {
        return Response.json({ error: "No image provided" }, { status: 400 });
      }
      const path = await store.saveUpload(file);
      return Response.json({ path });
    } catch {
      return Response.json({ error: "Upload failed" }, { status: 500 });
    }
  }

  if (url.pathname !== "/api/sessions") return null;

  if (req.method === "GET") {
    return Response.json(store.listSessions());
  }

  if (req.method === "POST") {
    const body = (await req.json()) as { name?: string; resumeId?: string; projectId?: string };
    const projectId = body.projectId || store.listProjects()[0]?.id;
    if (!projectId) return Response.json({ error: "no project found" }, { status: 400 });
    const session = store.createSession(body.name || "Untitled", projectId, body.resumeId);
    store.broadcastLobby();
    return Response.json({
      id: session.id,
      name: session.name,
      projectId: session.projectId,
    });
  }

  if (req.method === "PATCH") {
    const body = (await req.json()) as { id: string; name: string };
    const session = store.renameSession(body.id, body.name);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    store.broadcastLobby();
    return Response.json({ id: session.id, name: session.name });
  }

  if (req.method === "DELETE") {
    const body = (await req.json()) as { id: string };
    const session = store.getSession(body.id);
    if (!session) return Response.json({ error: "not found" }, { status: 404 });
    const project = store.getProject(session.projectId);
    if (project && project.sessions.size <= 1) {
      return Response.json({ error: "cannot delete last session in project" }, { status: 400 });
    }
    store.removeSession(body.id);
    store.broadcastLobby();
    return Response.json({ ok: true });
  }

  return null;
}
