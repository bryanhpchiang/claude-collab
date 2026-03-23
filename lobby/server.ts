import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { join, extname } from "path";

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

/** Poll until the instance has a public IP, up to ~60s */
async function waitForPublicIp(
  instanceId: string,
  maxAttempts = 20,
  delayMs = 3000,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const desc = await ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] }),
    );
    const inst = desc.Reservations?.[0]?.Instances?.[0];
    if (inst?.PublicIpAddress) return inst.PublicIpAddress;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timed out waiting for public IP on ${instanceId}`);
}

/** List running jam instances by tag */
async function listJamInstances() {
  const desc = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:Name", Values: [`${TAG_PREFIX}*`] },
        { Name: "instance-state-name", Values: ["pending", "running"] },
      ],
    }),
  );

  const results: {
    id: string;
    instanceId: string;
    ip: string | undefined;
    state: string;
  }[] = [];

  for (const reservation of desc.Reservations || []) {
    for (const inst of reservation.Instances || []) {
      const nameTag = inst.Tags?.find((t) => t.Key === "Name")?.Value || "";
      const jamId = nameTag.replace(TAG_PREFIX, "");
      results.push({
        id: jamId,
        instanceId: inst.InstanceId!,
        ip: inst.PublicIpAddress,
        state: inst.State?.Name || "unknown",
      });
    }
  }

  return results;
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
        const jamId = genId();

        const run = await ec2.send(
          new RunInstancesCommand({
            ImageId: AMI_ID,
            InstanceType: INSTANCE_TYPE,
            MinCount: 1,
            MaxCount: 1,
            SecurityGroupIds: [SECURITY_GROUP],
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

        const ip = await waitForPublicIp(instanceId);

        return Response.json(
          {
            id: jamId,
            instanceId,
            url: `http://${ip}:7681`,
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
      const user = getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: apiHeaders() });
      }

      try {
        const jams = await listJamInstances();
        return Response.json(
          jams.map((j) => ({
            id: j.id,
            instanceId: j.instanceId,
            url: j.ip ? `http://${j.ip}:7681` : null,
            state: j.state,
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
        const jams = await listJamInstances();
        const jam = jams.find((j) => j.id === jamId);
        if (!jam) {
          return Response.json({ error: "Jam not found" }, { status: 404, headers: apiHeaders() });
        }

        await ec2.send(
          new TerminateInstancesCommand({ InstanceIds: [jam.instanceId] }),
        );

        return Response.json(
          { ok: true, terminated: jam.instanceId },
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
