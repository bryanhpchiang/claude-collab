import type { CoordinationConfig } from "../config";
import {
  getSessionLookup,
  isGitHubOAuthEnabled,
  type CoordinationAuth,
  type SessionLookup,
  type SessionUser,
} from "../services/auth";
import type { Ec2Service } from "../services/ec2";
import { buildJamPath } from "../services/ec2";
import { clearCookie, getCookie, isSecureRequest, mergeHeaders, serializeCookie } from "../services/http";
import type { JamAccessService } from "../services/jam-access";
import type { JamRecord, JamRecordsService } from "../services/jam-records";
import type { JamSecretsService } from "../services/jam-secrets";
import { createRandomToken, hashInviteToken, signJamToken } from "../services/jam-tokens";
import {
  buildJamInstanceUserData,
  type JamRuntimeEnv,
} from "../services/user-data";

const INVITE_CLAIM_COOKIE = "jam_invite_claim";
const DEPLOY_HEADER = "x-jam-deploy-secret";
const BOOTSTRAP_TTL_SECONDS = 60;
const INVITE_CLAIM_TTL_SECONDS = 15 * 60;

type JamSummary = {
  id: string;
  instanceId: string;
  url: string | null;
  state: string;
  creator: {
    user_id: string;
    login: string;
    name: string;
    avatar_url: string;
  };
  created_at: string;
  name: string | null;
};

export type JamRouteContext = {
  config: CoordinationConfig;
  auth: CoordinationAuth;
  jamRecords: JamRecordsService;
  jamAccess: JamAccessService;
  jamSecrets: JamSecretsService;
  ec2: Ec2Service;
};

function apiHeaders(extra: HeadersInit = {}) {
  return mergeHeaders({
    "Access-Control-Allow-Origin": "*",
  }, extra);
}

function createJamId() {
  return Math.random().toString(36).slice(2, 8);
}


function buildAuthRedirect(returnTo: string, sessionHeaders: Headers, config: CoordinationConfig) {
  const location = isGitHubOAuthEnabled(config)
    ? `/auth/github?callback=${encodeURIComponent(returnTo)}`
    : "/";
  return new Response(null, {
    status: 302,
    headers: mergeHeaders(sessionHeaders, { Location: location }),
  });
}

function toJamSummary(record: JamRecord): JamSummary {
  return {
    id: record.id,
    instanceId: record.instance_id,
    url: record.state === "running" ? buildJamPath(record.id) : null,
    state: record.state,
    creator: {
      user_id: record.creator_user_id,
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

export async function listJamsForUser(
  context: JamRouteContext,
  userId: string,
): Promise<JamSummary[]> {
  const records = await context.jamRecords.listActiveJamsVisibleToUser(userId);

  await Promise.all(
    records.map(async (record) => {
      if (record.state !== "pending" || !record.target_group_arn) return;

      try {
        const healthy = await context.ec2.probeRuntime(record.target_group_arn);
        if (healthy) {
          record.state = "running";
          await context.jamRecords.updateJamState(record.id, "running", record.ip);
        }
      } catch {}
    }),
  );

  return records.map(toJamSummary);
}

async function requireUser(
  request: Request,
  context: JamRouteContext,
  returnTo: string,
  asApi = false,
): Promise<
  | { ok: true; session: SessionLookup; user: SessionUser }
  | { ok: false; response: Response }
> {
  const session = await getSessionLookup(request, context.auth);
  if (!session.user) {
    if (asApi) {
      return {
        ok: false,
        response: Response.json(
          { error: "Unauthorized" },
          { status: 401, headers: apiHeaders(session.headers) },
        ),
      };
    }

    return {
      ok: false,
      response: buildAuthRedirect(returnTo, session.headers, context.config),
    };
  }

  return { ok: true, session, user: session.user };
}

async function requireOwner(
  request: Request,
  context: JamRouteContext,
  jamId: string,
) {
  const authResult = await requireUser(request, context, `/j/${jamId}`, true);
  if (!authResult.ok) return authResult;

  const jam = await context.jamRecords.getJamRecord(jamId);
  if (!jam) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Jam not found" },
        { status: 404, headers: apiHeaders(authResult.session.headers) },
      ),
    };
  }

  if (jam.creator_user_id !== authResult.user.id) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Forbidden" },
        { status: 403, headers: apiHeaders(authResult.session.headers) },
      ),
    };
  }

  return { ok: true as const, jam, ...authResult };
}

async function userCanAccessJam(
  jam: JamRecord,
  userId: string,
  jamAccess: JamAccessService,
) {
  if (jam.creator_user_id === userId) return true;
  const membership = await jamAccess.getMembership(jam.id, userId);
  return Boolean(membership);
}

async function handleInviteClaim(
  request: Request,
  context: JamRouteContext,
  token: string,
) {
  const authResult = await requireUser(request, context, "/invite/claim");
  if (!authResult.ok) {
    const secure = isSecureRequest(request, context.config.baseUrl);
    return new Response(null, {
      status: 302,
      headers: mergeHeaders(authResult.response.headers, {
        "Set-Cookie": serializeCookie(INVITE_CLAIM_COOKIE, token, {
          maxAge: INVITE_CLAIM_TTL_SECONDS,
          secure,
        }),
      }),
    });
  }

  const result = await context.jamAccess.claimInviteLink(
    await hashInviteToken(token),
    authResult.user.id,
  );

  const headers = mergeHeaders(authResult.session.headers, {
    "Set-Cookie": clearCookie(INVITE_CLAIM_COOKIE, {
      secure: isSecureRequest(request, context.config.baseUrl),
    }),
  });

  if (!result.ok) {
    return new Response(result.error, { status: result.status, headers });
  }

  return new Response(null, {
    status: 302,
    headers: mergeHeaders(headers, { Location: buildJamPath(result.jamId) }),
  });
}

async function resolveJamSecrets(
  jam: JamRecord,
  jamSecrets: JamSecretsService,
) {
  if (jam.secret_arn) {
    return jamSecrets.getJamSecrets(jam.secret_arn);
  }

  return {
    sharedSecret: jam.shared_secret || "",
    deploySecret: jam.deploy_secret || "",
  };
}

export async function handleJamRoutes(
  request: Request,
  context: JamRouteContext,
) {
  const url = new URL(request.url);

  if (url.pathname === "/api/jams" && request.method === "POST") {
    const authResult = await requireUser(request, context, "/dashboard", true);
    if (!authResult.ok) return authResult.response;

    try {
      const body = (await request.json().catch(() => ({}))) as { name?: string };
      const jamName =
        typeof body.name === "string" ? body.name.trim().slice(0, 64) : undefined;

      const active = await context.jamRecords.getActiveJamsByCreator(authResult.user.id);
      if (active.length > 0) {
        return Response.json(
          { error: "You already have a running instance" },
          { status: 409, headers: apiHeaders(authResult.session.headers) },
        );
      }

      const jamId = createJamId();
      const runtimeEnv: JamRuntimeEnv = {
        jamId,
        publicHost: context.ec2.buildJamHost(jamId),
        sharedSecret: createRandomToken(48),
        deploySecret: createRandomToken(48),
      };

      let instanceId = "";
      let listenerRuleArn = "";
      let secretArn = "";
      let targetGroupArn = "";

      try {
        const secret = await context.jamSecrets.createJamSecrets(jamId, {
          sharedSecret: runtimeEnv.sharedSecret,
          deploySecret: runtimeEnv.deploySecret,
        });
        secretArn = secret.secretArn;

        instanceId = await context.ec2.launchJamInstance(
          jamId,
          buildJamInstanceUserData(context.config, runtimeEnv),
        );
        const target = await context.ec2.attachJamTarget(jamId, instanceId);
        listenerRuleArn = target.listenerRuleArn;
        targetGroupArn = target.targetGroupArn;

        const createdAt = new Date().toISOString();
        await context.jamRecords.putJamRecord({
          id: jamId,
          instance_id: instanceId,
          creator_user_id: authResult.user.id,
          creator_login: authResult.user.login,
          creator_name: authResult.user.name,
          creator_avatar: authResult.user.avatar_url,
          public_host: target.publicHost,
          secret_arn: secretArn,
          target_group_arn: targetGroupArn,
          listener_rule_arn: listenerRuleArn,
          state: "pending",
          created_at: createdAt,
          ...(jamName ? { name: jamName } : {}),
        });
        await context.jamAccess.addMember(
          jamId,
          authResult.user.id,
          "creator",
          createdAt,
        );

        return Response.json(
          {
            id: jamId,
            instanceId,
            url: null,
            state: "pending",
            creator: authResult.user,
            created_at: createdAt,
            name: jamName || null,
          },
          { headers: apiHeaders(authResult.session.headers) },
        );
      } catch (error) {
        if (listenerRuleArn || targetGroupArn) {
          await context.ec2.removeJamTarget(listenerRuleArn, targetGroupArn);
        }
        if (instanceId) {
          await context.ec2.terminateInstance(instanceId).catch(() => undefined);
        }
        if (secretArn) {
          await context.jamSecrets.deleteJamSecrets(secretArn).catch(() => undefined);
        }
        throw error;
      }
    } catch (error: any) {
      console.error("POST /api/jams error:", error);
      return Response.json(
        { error: error.message || "Internal error" },
        { status: 500, headers: apiHeaders(authResult.session.headers) },
      );
    }
  }

  if (url.pathname === "/api/jams" && request.method === "GET") {
    const authResult = await requireUser(request, context, "/dashboard", true);
    if (!authResult.ok) return authResult.response;

    try {
      return Response.json(
        await listJamsForUser(context, authResult.user.id),
        { headers: apiHeaders(authResult.session.headers) },
      );
    } catch (error: any) {
      console.error("GET /api/jams error:", error);
      return Response.json(
        { error: error.message || "Internal error" },
        { status: 500, headers: apiHeaders(authResult.session.headers) },
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
        .then((records) =>
          records.filter(
            (record) =>
              record.state === "running" &&
              record.public_host &&
              (record.secret_arn || record.deploy_secret),
          ),
        )
        .then((records) =>
          Promise.all(
            records.map(async (record) => {
              const secrets = await resolveJamSecrets(record, context.jamSecrets);
              if (!secrets.deploySecret) return undefined;

              return fetch(context.ec2.buildDeployUrl(record.public_host!), {
                method: "POST",
                headers: { [DEPLOY_HEADER]: secrets.deploySecret },
                signal: AbortSignal.timeout(30000),
              }).catch(() => undefined);
            }),
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

  const memberListMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)\/members$/);
  if (memberListMatch && request.method === "GET") {
    const ownerResult = await requireOwner(request, context, memberListMatch[1]);
    if (!ownerResult.ok) return ownerResult.response;

    return Response.json(
      {
        members: await context.jamAccess.listMembers(ownerResult.jam.id),
        inviteLinks: await context.jamAccess.listInviteLinks(ownerResult.jam.id),
      },
      { headers: apiHeaders(ownerResult.session.headers) },
    );
  }

  const inviteCreateMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)\/invite-links$/);
  if (inviteCreateMatch && request.method === "POST") {
    const ownerResult = await requireOwner(request, context, inviteCreateMatch[1]);
    if (!ownerResult.ok) return ownerResult.response;

    const inviteId = createRandomToken(12);
    const rawToken = createRandomToken(32);
    const createdAt = new Date().toISOString();

    await context.jamAccess.createInviteLink({
      id: inviteId,
      jam_id: ownerResult.jam.id,
      token_hash: await hashInviteToken(rawToken),
      created_by_user_id: ownerResult.user.id,
      created_at: createdAt,
    });

    return Response.json(
      {
        id: inviteId,
        created_at: createdAt,
        url: `${context.config.baseUrl}/invite/${rawToken}`,
      },
      { headers: apiHeaders(ownerResult.session.headers) },
    );
  }

  const inviteDeleteMatch = url.pathname.match(
    /^\/api\/jams\/([a-z0-9]+)\/invite-links\/([^/]+)$/,
  );
  if (inviteDeleteMatch && request.method === "DELETE") {
    const ownerResult = await requireOwner(request, context, inviteDeleteMatch[1]);
    if (!ownerResult.ok) return ownerResult.response;

    await context.jamAccess.revokeInviteLink(ownerResult.jam.id, inviteDeleteMatch[2]);
    return Response.json(
      { ok: true },
      { headers: apiHeaders(ownerResult.session.headers) },
    );
  }

  const memberDeleteMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)\/members\/([^/]+)$/);
  if (memberDeleteMatch && request.method === "DELETE") {
    const ownerResult = await requireOwner(request, context, memberDeleteMatch[1]);
    if (!ownerResult.ok) return ownerResult.response;

    const userId = decodeURIComponent(memberDeleteMatch[2]);
    if (userId === ownerResult.jam.creator_user_id) {
      return Response.json(
        { error: "Cannot remove the jam creator" },
        { status: 400, headers: apiHeaders(ownerResult.session.headers) },
      );
    }

    await context.jamAccess.removeMember(ownerResult.jam.id, userId);
    return Response.json(
      { ok: true },
      { headers: apiHeaders(ownerResult.session.headers) },
    );
  }

  const deleteMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)$/);
  if (deleteMatch && request.method === "DELETE") {
    const ownerResult = await requireOwner(request, context, deleteMatch[1]);
    if (!ownerResult.ok) return ownerResult.response;

    try {
      await context.ec2.removeJamTarget(
        ownerResult.jam.listener_rule_arn,
        ownerResult.jam.target_group_arn,
      );
      await context.ec2.terminateInstance(ownerResult.jam.instance_id);
      await context.jamRecords.updateJamState(ownerResult.jam.id, "terminated");
      if (ownerResult.jam.secret_arn) {
        await context.jamSecrets.deleteJamSecrets(ownerResult.jam.secret_arn);
      }

      return Response.json(
        { ok: true, terminated: ownerResult.jam.instance_id },
        { headers: apiHeaders(ownerResult.session.headers) },
      );
    } catch (error: any) {
      console.error("DELETE /api/jams error:", error);
      return Response.json(
        { error: error.message || "Internal error" },
        { status: 500, headers: apiHeaders(ownerResult.session.headers) },
      );
    }
  }

  if (url.pathname === "/invite/claim" && request.method === "GET") {
    const token = getCookie(request, INVITE_CLAIM_COOKIE);
    if (!token) {
      return new Response("Invite link not found", { status: 400 });
    }

    return handleInviteClaim(request, context, token);
  }

  const inviteTokenMatch = url.pathname.match(/^\/invite\/([A-Za-z0-9\-_]+)$/);
  if (inviteTokenMatch && request.method === "GET") {
    return handleInviteClaim(request, context, inviteTokenMatch[1]);
  }

  const jamPageMatch = url.pathname.match(/^\/j\/([a-z0-9]+)$/);
  if (jamPageMatch && request.method === "GET") {
    const jam = await context.jamRecords.getJamRecord(jamPageMatch[1]);
    if (!jam) {
      return new Response("Jam not found", { status: 404 });
    }

    const authResult = await requireUser(
      request,
      context,
      `${buildJamPath(jam.id)}${url.search}`,
    );
    if (!authResult.ok) return authResult.response;

    const allowed = await userCanAccessJam(jam, authResult.user.id, context.jamAccess);
    if (!allowed) {
      return new Response("Forbidden", { status: 403 });
    }

    if (jam.state !== "running" || !jam.public_host) {
      return new Response("Jam not ready", { status: 409 });
    }

    const secrets = await resolveJamSecrets(jam, context.jamSecrets);
    if (!secrets.sharedSecret) {
      return new Response("Jam not ready", { status: 409 });
    }

    const bootstrapToken = await signJamToken(secrets.sharedSecret, {
      kind: "bootstrap",
      jamId: jam.id,
      user: {
        id: authResult.user.id,
        email: authResult.user.email,
        login: authResult.user.login,
        name: authResult.user.name,
        avatar_url: authResult.user.avatar_url,
      },
      redirectPath: url.search ? `/${url.search}` : "/",
      exp: Date.now() + BOOTSTRAP_TTL_SECONDS * 1000,
    });

    const target = new URL(`https://${jam.public_host}/bootstrap`);
    target.searchParams.set("token", bootstrapToken);
    return Response.redirect(target.toString(), 302);
  }

  return null;
}
