import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { join, extname } from "path";
import { waitForPublicIp } from "./ec2";

const PORT = Number(process.env.PORT) || 8080;

// Static file serving for the React client build
const CLIENT_DIST = join(import.meta.dir, "..", "client", "dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".map": "application/json",
  ".txt": "text/plain",
};

const AWS_REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const AMI_ID = process.env.JAM_AMI_ID || "ami-0b694e8fc9890bec7";
const SECURITY_GROUP =
  process.env.JAM_SECURITY_GROUP_ID || "sg-092ad16c7428104a3";
const INSTANCE_TYPE = process.env.JAM_INSTANCE_TYPE || "t3.medium";
const TAG_PREFIX = process.env.JAM_TAG_PREFIX || "jam-";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const BASE_URL = process.env.BASE_URL || "";
const GITHUB_OAUTH_ENABLED = Boolean(
  GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET,
);

const ec2 = new EC2Client({ region: AWS_REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));
const JAM_TABLE = process.env.JAM_TABLE_NAME || "jam-instances";

type InstanceRecord = {
  id: string;
  instance_id: string;
  creator_login: string;
  creator_name: string;
  creator_avatar: string;
  ip?: string;
  state: string;
  created_at: string;
};

async function putInstance(item: InstanceRecord) {
  await ddb.send(new PutCommand({
    TableName: JAM_TABLE,
    Item: item,
    ConditionExpression: "attribute_not_exists(id)",
  }));
}

async function getInstance(id: string): Promise<InstanceRecord | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: JAM_TABLE, Key: { id } }));
  return res.Item as InstanceRecord | undefined;
}

async function getActiveByCreator(login: string): Promise<InstanceRecord[]> {
  const [pending, running] = await Promise.all([
    ddb.send(new QueryCommand({
      TableName: JAM_TABLE,
      IndexName: "creator-index",
      KeyConditionExpression: "creator_login = :login AND #s = :state",
      ExpressionAttributeNames: { "#s": "state" },
      ExpressionAttributeValues: { ":login": login, ":state": "pending" },
    })),
    ddb.send(new QueryCommand({
      TableName: JAM_TABLE,
      IndexName: "creator-index",
      KeyConditionExpression: "creator_login = :login AND #s = :state",
      ExpressionAttributeNames: { "#s": "state" },
      ExpressionAttributeValues: { ":login": login, ":state": "running" },
    })),
  ]);
  return [...(pending.Items || []), ...(running.Items || [])] as InstanceRecord[];
}

async function updateInstanceState(id: string, state: string, ip?: string) {
  const expr = ip
    ? "SET #s = :state, ip = :ip"
    : "SET #s = :state";
  const values: Record<string, string> = { ":state": state };
  if (ip) values[":ip"] = ip;
  await ddb.send(new UpdateCommand({
    TableName: JAM_TABLE,
    Key: { id },
    UpdateExpression: expr,
    ExpressionAttributeNames: { "#s": "state" },
    ExpressionAttributeValues: values,
  }));
}

async function scanActiveInstances(): Promise<InstanceRecord[]> {
  const res = await ddb.send(new ScanCommand({
    TableName: JAM_TABLE,
    FilterExpression: "#s = :pending OR #s = :running",
    ExpressionAttributeNames: { "#s": "state" },
    ExpressionAttributeValues: { ":pending": "pending", ":running": "running" },
  }));
  return (res.Items || []) as InstanceRecord[];
}

type SessionUser = {
  login: string;
  name: string;
  avatar_url: string;
};

const sessions = new Map<string, SessionUser>();

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function genToken(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k) cookies[k] = v.join("=");
  }
  return cookies;
}

function getUser(req: Request) {
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies["jam_session"];
  return token ? sessions.get(token) : undefined;
}

function getBaseUrl(req: Request) {
  return BASE_URL || new URL(req.url).origin;
}

function getSecureCookieAttribute(req: Request) {
  return getBaseUrl(req).startsWith("https://") ? "; Secure" : "";
}

function apiHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
  };
}


const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "jam-lobby" }, { headers: apiHeaders() });
    }

    if (url.pathname === "/auth/github") {
      if (!GITHUB_OAUTH_ENABLED) {
        return new Response("GitHub OAuth is not configured", { status: 503 });
      }

      const redirect = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(getBaseUrl(req) + "/auth/github/callback")}&scope=read:user`;
      return Response.redirect(redirect, 302);
    }

    if (url.pathname === "/auth/github/callback") {
      if (!GITHUB_OAUTH_ENABLED) {
        return new Response("GitHub OAuth is not configured", { status: 503 });
      }

      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      try {
        const tokenRes = await fetch(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              client_id: GITHUB_CLIENT_ID,
              client_secret: GITHUB_CLIENT_SECRET,
              code,
            }),
          },
        );

        const tokenData = (await tokenRes.json()) as {
          access_token?: string;
          error?: string;
        };

        if (!tokenData.access_token) {
          return new Response(
            "OAuth failed: " + (tokenData.error || "unknown"),
            { status: 400 },
          );
        }

        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "User-Agent": "jam-coordination-server",
          },
        });

        if (!userRes.ok) {
          return new Response("Failed to load GitHub user", { status: 400 });
        }

        const userData = (await userRes.json()) as {
          login: string;
          name: string | null;
          avatar_url: string;
        };

        const token = genToken();
        sessions.set(token, {
          login: userData.login,
          name: userData.name || userData.login,
          avatar_url: userData.avatar_url,
        });

        return new Response(null, {
          status: 302,
          headers: {
            Location: "/dashboard",
            "Set-Cookie": `jam_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${getSecureCookieAttribute(req)}`,
          },
        });
      } catch (err: any) {
        console.error("OAuth callback error:", err);
        return new Response("OAuth error: " + err.message, { status: 500 });
      }
    }

    if (url.pathname === "/auth/logout") {
      const cookies = parseCookies(req.headers.get("cookie"));
      const token = cookies["jam_session"];
      if (token) sessions.delete(token);

      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": `jam_session=; Path=/; HttpOnly; Max-Age=0${getSecureCookieAttribute(req)}`,
        },
      });
    }

    if (url.pathname === "/api/me") {
      const user = getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: apiHeaders() });
      }
      return Response.json(user, { headers: apiHeaders() });
    }

    if (url.pathname === "/api/jams" && req.method === "POST") {
      const user = getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: apiHeaders() });
      }

      try {
        const active = await getActiveByCreator(user.login);
        if (active.length > 0) {
          return Response.json(
            { error: "You already have a running instance" },
            { status: 409, headers: apiHeaders() },
          );
        }

        const jamId = genId();

        const userData = Buffer.from(`#!/bin/bash
set -ex
cd /opt/jam
git pull origin main
export BUN_INSTALL="/root/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
bun install
bun run server.ts &
`).toString("base64");

        const run = await ec2.send(
          new RunInstancesCommand({
            ImageId: AMI_ID,
            InstanceType: INSTANCE_TYPE,
            MinCount: 1,
            MaxCount: 1,
            SecurityGroupIds: [SECURITY_GROUP],
            UserData: userData,
            TagSpecifications: [
              {
                ResourceType: "instance",
                Tags: [{ Key: "Name", Value: `${TAG_PREFIX}${jamId}` }],
              },
            ],
          }),
        );

        const instanceId = run.Instances?.[0]?.InstanceId;
        if (!instanceId) {
          return Response.json(
            { error: "Failed to launch instance" },
            { status: 500, headers: apiHeaders() },
          );
        }

        await putInstance({
          id: jamId,
          instance_id: instanceId,
          creator_login: user.login,
          creator_name: user.name,
          creator_avatar: user.avatar_url,
          state: "pending",
          created_at: new Date().toISOString(),
        });

        const ip = await waitForPublicIp(async () => {
          const desc = await ec2.send(
            new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
          );
          return desc.Reservations?.[0]?.Instances?.[0];
        });

        await updateInstanceState(jamId, "running", ip);

        return Response.json(
          {
            id: jamId,
            instanceId,
            url: `http://${ip}:7681`,
            creator: { login: user.login, name: user.name, avatar_url: user.avatar_url },
            created_at: new Date().toISOString(),
          },
          { headers: apiHeaders() },
        );
      } catch (err: any) {
        console.error("POST /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500, headers: apiHeaders() },
        );
      }
    }

    if (url.pathname === "/api/jams" && req.method === "GET") {
      try {
        const instances = await scanActiveInstances();

        return Response.json(
          instances.map((inst) => ({
            id: inst.id,
            instanceId: inst.instance_id,
            url: inst.ip ? `http://${inst.ip}:7681` : null,
            state: inst.state,
            creator: {
              login: inst.creator_login,
              name: inst.creator_name,
              avatar_url: inst.creator_avatar,
            },
            created_at: inst.created_at,
          })),
          { headers: apiHeaders() },
        );
      } catch (err: any) {
        console.error("GET /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500, headers: apiHeaders() },
        );
      }
    }

    const deleteMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const user = getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: apiHeaders() });
      }

      const jamId = deleteMatch[1];
      try {
        const jam = await getInstance(jamId);
        if (!jam) {
          return Response.json({ error: "Jam not found" }, { status: 404, headers: apiHeaders() });
        }

        if (jam.creator_login !== user.login) {
          return Response.json({ error: "Forbidden" }, { status: 403, headers: apiHeaders() });
        }

        await ec2.send(
          new TerminateInstancesCommand({ InstanceIds: [jam.instance_id] }),
        );

        await updateInstanceState(jamId, "terminated");

        return Response.json(
          { ok: true, terminated: jam.instance_id },
          { headers: apiHeaders() },
        );
      } catch (err: any) {
        console.error("DELETE /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500, headers: apiHeaders() },
        );
      }
    }

    const filePath = join(CLIENT_DIST, url.pathname);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const ext = extname(url.pathname);
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    }

    const indexFile = Bun.file(join(CLIENT_DIST, "index.html"));
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Jam lobby running on http://localhost:${PORT}`);
