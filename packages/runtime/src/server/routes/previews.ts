import {
  COORDINATION_BASE_URL,
  JAM_ID,
  JAM_SHARED_SECRET,
} from "../../config";
import { JAM_SHARED_SECRET_HEADER } from "shared";
import type { AuthenticatedRuntimeUser } from "../runtime-auth";

function getJamId() {
  return process.env.JAM_ID || JAM_ID;
}

function getSharedSecret() {
  return process.env.JAM_SHARED_SECRET || JAM_SHARED_SECRET;
}

function getCoordinationBaseUrl() {
  return process.env.COORDINATION_BASE_URL || COORDINATION_BASE_URL;
}

export function hasInternalPreviewAccess(request: Request) {
  const provided = request.headers.get(JAM_SHARED_SECRET_HEADER) || "";
  const sharedSecret = getSharedSecret();
  return Boolean(sharedSecret && provided && provided === sharedSecret);
}

async function forwardPreviewRequest(
  request: Request,
  path: string,
  body?: string,
) {
  const headers = new Headers();
  headers.set(JAM_SHARED_SECRET_HEADER, getSharedSecret());

  if (body !== undefined) {
    headers.set(
      "content-type",
      request.headers.get("content-type") || "application/json",
    );
  }

  const response = await fetch(
    `${getCoordinationBaseUrl().replace(/\/$/, "")}${path}`,
    {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
    },
  );

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") || "application/json",
    },
  });
}

export async function handlePreviewRoute(
  request: Request,
  url: URL,
  user?: AuthenticatedRuntimeUser | null,
) {
  const collectionPath = `/api/internal/jams/${getJamId()}/previews`;
  if (url.pathname === "/api/previews") {
    if (request.method !== "GET" && request.method !== "POST") return null;
    if (!user && !hasInternalPreviewAccess(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = request.method === "POST" ? await request.text() : undefined;
    return forwardPreviewRequest(request, collectionPath, body);
  }

  const deleteMatch = url.pathname.match(/^\/api\/previews\/([a-z0-9]+)$/);
  if (!deleteMatch || request.method !== "DELETE") return null;
  if (!user && !hasInternalPreviewAccess(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return forwardPreviewRequest(
    request,
    `${collectionPath}/${deleteMatch[1]}`,
  );
}
