import { signToken } from "shared";
import { COORDINATION_BASE_URL, JAM_ID, JAM_SHARED_SECRET } from "../../config";
import { getAuthenticatedUser } from "../runtime-auth";

const SERVICE_TOKEN_TTL_MS = 60 * 1000;

function getJamId() {
  return process.env.JAM_ID || JAM_ID;
}

function getRuntimeSecret() {
  return process.env.RUNTIME_SECRET || process.env.JAM_SHARED_SECRET || JAM_SHARED_SECRET;
}

function getCoordinationBaseUrl() {
  return process.env.COORDINATION_BASE_URL || COORDINATION_BASE_URL;
}

async function mintServiceToken(userId: string, jamId: string) {
  return signToken(getRuntimeSecret(), {
    kind: "service",
    userId,
    jamId,
    exp: Date.now() + SERVICE_TOKEN_TTL_MS,
  });
}

function coordinationInviteUrl(jamId: string) {
  return `${getCoordinationBaseUrl().replace(/\/$/, "")}/api/jams/${jamId}/invite-links`;
}

export async function handleInvitesRoute(req: Request, url: URL) {
  const jamId = getJamId();

  if (url.pathname === "/api/invite-links" && req.method === "GET") {
    const user = await getAuthenticatedUser(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = await mintServiceToken(user.id, jamId);
    // Fetch members+inviteLinks from coordination members endpoint
    const coordUrl = `${getCoordinationBaseUrl().replace(/\/$/, "")}/api/jams/${jamId}/members`;
    const resp = await fetch(coordUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!resp || !resp.ok) {
      const status = resp?.status ?? 502;
      const body = await resp?.json().catch(() => ({ error: "Upstream error" }));
      return Response.json(body, { status });
    }

    const data = await resp.json();
    return Response.json({ inviteLinks: data.inviteLinks ?? [] });
  }

  if (url.pathname === "/api/invite-links" && req.method === "POST") {
    const user = await getAuthenticatedUser(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = await mintServiceToken(user.id, jamId);
    const resp = await fetch(coordinationInviteUrl(jamId), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!resp || !resp.ok) {
      const status = resp?.status ?? 502;
      const body = await resp?.json().catch(() => ({ error: "Upstream error" }));
      return Response.json(body, { status });
    }

    return Response.json(await resp.json());
  }

  const revokeMatch = url.pathname.match(/^\/api\/invite-links\/([^/]+)$/);
  if (revokeMatch && req.method === "DELETE") {
    const user = await getAuthenticatedUser(req);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const inviteLinkId = revokeMatch[1];
    const token = await mintServiceToken(user.id, jamId);
    const deleteUrl = `${getCoordinationBaseUrl().replace(/\/$/, "")}/api/jams/${jamId}/invite-links/${inviteLinkId}`;
    const resp = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (!resp || !resp.ok) {
      const status = resp?.status ?? 502;
      const body = await resp?.json().catch(() => ({ error: "Upstream error" }));
      return Response.json(body, { status });
    }

    return Response.json(await resp.json());
  }

  return null;
}
