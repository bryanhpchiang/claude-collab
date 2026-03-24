import type { RuntimeStore } from "../runtime-store";

export async function handleSecretsRoute(req: Request, url: URL, store: RuntimeStore) {
  if (url.pathname === "/api/secrets") {
    if (req.method === "GET") {
      return Response.json(store.listSecrets());
    }

    if (req.method === "POST") {
      const body = (await req.json()) as {
        name?: string;
        value?: string;
        user?: string;
      };
      if (!body.name || !body.value || !body.user) {
        return Response.json({ error: "missing fields" }, { status: 400 });
      }
      store.saveSecret(body.name, body.value, body.user);
      return Response.json({ ok: true, name: body.name });
    }
  }

  const deleteMatch = url.pathname.match(/^\/api\/secrets\/(.+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const name = decodeURIComponent(deleteMatch[1]);
    const result = store.deleteSecret(name, url.searchParams.get("user") || undefined);
    if (!result.ok) {
      return Response.json(
        { error: result.status === 403 ? "unauthorized" : "not found" },
        { status: result.status },
      );
    }
    return Response.json({ ok: true });
  }

  return null;
}
