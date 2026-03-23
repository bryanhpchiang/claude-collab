import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { createClerkClient } from "@clerk/backend";
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

// Clerk auth
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";
const CLERK_PUBLISHABLE_KEY =
  process.env.CLERK_PUBLISHABLE_KEY ||
  "pk_test_Y2FwYWJsZS1oZXJtaXQtMTUuY2xlcmsuYWNjb3VudHMuZGV2JA";

const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

const ec2 = new EC2Client({ region: AWS_REGION });

function genId(): string {
  return Math.random().toString(36).slice(2, 8);
}

interface ClerkUser {
  userId: string;
  name: string;
  avatar_url: string;
}

// Cache Clerk user info to avoid fetching on every request (5 min TTL)
const userCache = new Map<string, { user: ClerkUser; expiresAt: number }>();
const USER_CACHE_TTL = 5 * 60 * 1000;

/** Extract and verify a Clerk JWT from the Authorization header */
async function getUser(req: Request): Promise<ClerkUser | undefined> {
  const requestUrl = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    console.warn("Clerk auth missing bearer token", {
      path: requestUrl.pathname,
      hasAuthorizationHeader: Boolean(authHeader),
      authorizationScheme: authHeader?.split(" ")[0] || null,
    });
    return undefined;
  }

  const token = authHeader.slice(7);
  let payload;

  try {
    payload = await clerk.verifyToken(token, {
      authorizedParties: [],
    });
  } catch (error) {
    console.warn("Clerk token verification failed", {
      path: requestUrl.pathname,
      tokenLength: token.length,
      hasClerkSecretKey: Boolean(CLERK_SECRET_KEY),
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    return undefined;
  }

  const userId = payload.sub;

  // Check cache
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  try {
    // Fetch full user info from Clerk
    const clerkUser = await clerk.users.getUser(userId);
    const user: ClerkUser = {
      userId,
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        clerkUser.username ||
        userId,
      avatar_url: clerkUser.imageUrl || "",
    };
    userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL });
    return user;
  } catch (error) {
    console.warn("Clerk user lookup failed", {
      path: requestUrl.pathname,
      userId,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    return undefined;
  }
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

// -- Server --

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // --- CORS preflight for API routes ---
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }

    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
    };

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "jam-lobby" }, { headers: corsHeaders });
    }

    // --- Create a Jam (auth required) ---
    if (url.pathname === "/api/jams" && req.method === "POST") {
      const user = await getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
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
            { status: 500, headers: corsHeaders },
          );
        }

        const ip = await waitForPublicIp(instanceId);

        return Response.json({
          id: jamId,
          instanceId,
          url: `http://${ip}:7681`,
        }, { headers: corsHeaders });
      } catch (err: any) {
        console.error("POST /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // --- List Jams (auth required) ---
    if (url.pathname === "/api/jams" && req.method === "GET") {
      const user = await getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
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
          { headers: corsHeaders },
        );
      } catch (err: any) {
        console.error("GET /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // --- Delete a Jam (auth required) ---
    const deleteMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const user = await getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
      }

      const jamId = deleteMatch[1];
      try {
        const jams = await listJamInstances();
        const jam = jams.find((j) => j.id === jamId);
        if (!jam) {
          return Response.json({ error: "Jam not found" }, { status: 404, headers: corsHeaders });
        }

        await ec2.send(
          new TerminateInstancesCommand({ InstanceIds: [jam.instanceId] }),
        );

        return Response.json({ ok: true, terminated: jam.instanceId }, { headers: corsHeaders });
      } catch (err: any) {
        console.error("DELETE /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500, headers: corsHeaders },
        );
      }
    }

    // --- Static file serving for React client ---
    // Try to serve a static file from client/dist/
    const filePath = join(CLIENT_DIST, url.pathname);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const ext = extname(url.pathname);
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    }

    // --- SPA fallback: serve index.html for all other routes ---
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
