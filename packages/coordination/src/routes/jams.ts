import type { CoordinationConfig } from "../config";
import type { Ec2Service } from "../services/ec2";
import { buildJamInstanceUserData } from "../services/user-data";
import { getSessionUser, type SessionStore } from "../services/github-oauth";
import type { JamRecord, JamRecordsService } from "../services/jam-records";

type JamSummary = {
  id: string;
  instanceId: string;
  url: string | null;
  state: string;
  creator: {
    login: string;
    name: string;
    avatar_url: string;
  };
  created_at: string;
  name: string | null;
};

export type JamRouteContext = {
  config: CoordinationConfig;
  sessions: SessionStore;
  jamRecords: JamRecordsService;
  ec2: Ec2Service;
};

function apiHeaders(extra: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}

function createJamId() {
  return Math.random().toString(36).slice(2, 8);
}

function toJamSummary(record: JamRecord, ec2: Ec2Service): JamSummary {
  return {
    id: record.id,
    instanceId: record.instance_id,
    url: record.state === "running" ? ec2.buildJamPath(record.id) : null,
    state: record.state,
    creator: {
      login: record.creator_login,
      name: record.creator_name,
      avatar_url: record.creator_avatar,
    },
    created_at: record.created_at,
    name: record.name || null,
  };
}

async function verifyWebhookSignature(
  secret: string,
  signature: string,
  payload: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  const expected =
    "sha256=" +
    [...new Uint8Array(mac)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  return expected === signature;
}

export async function listJams(context: JamRouteContext): Promise<JamSummary[]> {
  const records = await context.jamRecords.scanActiveJamRecords();

  await Promise.all(
    records.map(async (record) => {
      if (record.state !== "pending") return;

      if (!record.ip) {
        try {
          const ip = await context.ec2.resolvePublicIp(record.instance_id);
          if (ip) {
            record.ip = ip;
            await context.jamRecords.updateJamState(record.id, "pending", ip);
          }
        } catch {}
      }

      if (record.ip) {
        try {
          const healthy = await context.ec2.probeRuntime(record.ip);
          if (healthy) {
            record.state = "running";
            await context.jamRecords.updateJamState(record.id, "running", record.ip);
          }
        } catch {}
      }
    }),
  );

  return records.map((record) => toJamSummary(record, context.ec2));
}

export async function handleJamRoutes(
  request: Request,
  context: JamRouteContext,
) {
  const url = new URL(request.url);

  if (url.pathname === "/api/jams" && request.method === "POST") {
    const user = getSessionUser(request, context.sessions);
    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: apiHeaders() },
      );
    }

    try {
      const body = (await request.json().catch(() => ({}))) as { name?: string };
      const jamName =
        typeof body.name === "string" ? body.name.trim().slice(0, 64) : undefined;

      const active = await context.jamRecords.getActiveJamsByCreator(user.login);
      if (active.length > 0) {
        return Response.json(
          { error: "You already have a running instance" },
          { status: 409, headers: apiHeaders() },
        );
      }

      const jamId = createJamId();
      const instanceId = await context.ec2.launchJamInstance(
        jamId,
        buildJamInstanceUserData(context.config),
      );
      const createdAt = new Date().toISOString();

      await context.jamRecords.putJamRecord({
        id: jamId,
        instance_id: instanceId,
        creator_login: user.login,
        creator_name: user.name,
        creator_avatar: user.avatar_url,
        state: "pending",
        created_at: createdAt,
        ...(jamName ? { name: jamName } : {}),
      });

      return Response.json(
        {
          id: jamId,
          instanceId,
          url: null,
          state: "pending",
          creator: user,
          created_at: createdAt,
          name: jamName || null,
        },
        { headers: apiHeaders() },
      );
    } catch (error: any) {
      console.error("POST /api/jams error:", error);
      return Response.json(
        { error: error.message || "Internal error" },
        { status: 500, headers: apiHeaders() },
      );
    }
  }

  if (url.pathname === "/api/jams" && request.method === "GET") {
    try {
      return Response.json(await listJams(context), { headers: apiHeaders() });
    } catch (error: any) {
      console.error("GET /api/jams error:", error);
      return Response.json(
        { error: error.message || "Internal error" },
        { status: 500, headers: apiHeaders() },
      );
    }
  }

  if (url.pathname === "/api/webhook/github" && request.method === "POST") {
    try {
      const body = await request.text();

      if (context.config.githubWebhookSecret) {
        const signature = request.headers.get("x-hub-signature-256") || "";
        const isValid = await verifyWebhookSignature(
          context.config.githubWebhookSecret,
          signature,
          body,
        );
        if (!isValid) {
          return Response.json(
            { error: "Invalid signature" },
            { status: 403, headers: apiHeaders() },
          );
        }
      }

      const payload = JSON.parse(body);
      if (payload.ref !== "refs/heads/main") {
        return Response.json(
          { ok: true, skipped: true, reason: "not main branch" },
          { headers: apiHeaders() },
        );
      }

      context.jamRecords
        .scanActiveJamRecords()
        .then((records) => records.filter((record) => record.state === "running" && record.ip))
        .then((records) =>
          Promise.all(
            records.map((record) =>
              fetch(`http://${record.ip}:${context.config.jamRuntimePort}/api/deploy`, {
                method: "POST",
                signal: AbortSignal.timeout(30000),
              }).catch(() => undefined),
            ),
          ),
        )
        .catch(() => undefined);

      return Response.json(
        { ok: true, deployed: "in_progress" },
        { headers: apiHeaders() },
      );
    } catch (error: any) {
      console.error("Webhook error:", error);
      return Response.json(
        { error: error.message || "Internal error" },
        { status: 500, headers: apiHeaders() },
      );
    }
  }

  const deleteMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const user = getSessionUser(request, context.sessions);
    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: apiHeaders() },
      );
    }

    try {
      const jam = await context.jamRecords.getJamRecord(deleteMatch[1]);
      if (!jam) {
        return Response.json(
          { error: "Jam not found" },
          { status: 404, headers: apiHeaders() },
        );
      }

      if (jam.creator_login !== user.login) {
        return Response.json(
          { error: "Forbidden" },
          { status: 403, headers: apiHeaders() },
        );
      }

      await context.ec2.terminateInstance(jam.instance_id);
      await context.jamRecords.updateJamState(jam.id, "terminated");

      return Response.json(
        { ok: true, terminated: jam.instance_id },
        { headers: apiHeaders() },
      );
    } catch (error: any) {
      console.error("DELETE /api/jams error:", error);
      return Response.json(
        { error: error.message || "Internal error" },
        { status: 500, headers: apiHeaders() },
      );
    }
  }

  const jamPageMatch = url.pathname.match(/^\/j\/([a-z0-9]+)$/);
  if (jamPageMatch && request.method === "GET") {
    const jam = await context.jamRecords.getJamRecord(jamPageMatch[1]);
    if (!jam) {
      return new Response("Jam not found", { status: 404 });
    }

    if (jam.state !== "running" || !jam.ip) {
      return new Response("Jam not ready", { status: 409 });
    }

    return Response.redirect(context.ec2.buildJamRedirectUrl(jam.ip, request.url), 302);
  }
}
