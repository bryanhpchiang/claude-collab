import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";

const PORT = Number(process.env.PORT) || 8080;
const AWS_REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
const AMI_ID = process.env.JAM_AMI_ID || "ami-0b694e8fc9890bec7";
const SECURITY_GROUP =
  process.env.JAM_SECURITY_GROUP_ID || "sg-092ad16c7428104a3";
const INSTANCE_TYPE = process.env.JAM_INSTANCE_TYPE || "t3.medium";
const TAG_PREFIX = process.env.JAM_TAG_PREFIX || "jam-";

// GitHub OAuth
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const BASE_URL = process.env.BASE_URL || "";
const GITHUB_OAUTH_ENABLED = Boolean(
  GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET
);

const ec2 = new EC2Client({ region: AWS_REGION });

// Simple in-memory session store: token -> github user info
const sessions = new Map<
  string,
  { login: string; name: string; avatar_url: string }
>();

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

// -- Landing page HTML --

function renderPage(user?: {
  login: string;
  name: string;
  avatar_url: string;
}) {
  const userSection = user
    ? `<div style="display:flex;align-items:center;gap:8px;">
        <img src="${user.avatar_url}" width="24" height="24" style="border-radius:50%;">
        <span>${user.name || user.login}</span>
        <a href="/auth/logout" style="margin-left:12px;color:#888;">logout</a>
      </div>`
    : "";

  const action = user
    ? `<button onclick="startJam()" id="startBtn" style="padding:8px 20px;background:#333;color:#fff;border:1px solid #555;cursor:pointer;font-size:14px;">Start a Jam</button>
       <div id="status" style="margin-top:8px;color:#888;font-size:13px;"></div>`
    : GITHUB_OAUTH_ENABLED
      ? `<a href="/auth/github" style="padding:8px 20px;background:#333;color:#fff;border:1px solid #555;text-decoration:none;font-size:14px;display:inline-block;">Sign in with GitHub</a>`
      : `<div style="padding:8px 20px;background:#161b22;color:#8b949e;border:1px solid #30363d;display:inline-block;font-size:14px;">GitHub OAuth is not configured yet.</div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jam</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; color: #e6edf3; background: #0d1117; }
    a { color: #7ab3ff; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    p { color: #8b949e; margin-bottom: 24px; }
    nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; font-size: 14px; }
  </style>
</head>
<body>
  <nav>
    <strong>Jam</strong>
    ${userSection}
  </nav>
  <h1>Jam</h1>
  <p>Multiplayer Claude Code. Start a session, share the link, code together.</p>
  ${action}
  <script>
    async function startJam() {
      const btn = document.getElementById('startBtn');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.textContent = 'Starting...';
      status.textContent = 'Launching instance...';
      try {
        const res = await fetch('/api/jams', { method: 'POST' });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
        const data = await res.json();
        status.textContent = 'Ready! Redirecting...';
        window.location.href = data.url;
      } catch(e) {
        status.textContent = 'Error: ' + e.message;
        btn.disabled = false;
        btn.textContent = 'Start a Jam';
      }
    }
  </script>
</body>
</html>`;
}

// -- Server --

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "jam-lobby" });
    }

    // --- Landing page ---
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const user = getUser(req);
      return new Response(renderPage(user), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // --- GitHub OAuth: redirect ---
    if (url.pathname === "/auth/github") {
      if (!GITHUB_OAUTH_ENABLED) {
        return new Response("GitHub OAuth is not configured", { status: 503 });
      }

      const redirect = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(getBaseUrl(req) + "/auth/github/callback")}&scope=read:user`;
      return Response.redirect(redirect, 302);
    }

    // --- GitHub OAuth: callback ---
    if (url.pathname === "/auth/github/callback") {
      if (!GITHUB_OAUTH_ENABLED) {
        return new Response("GitHub OAuth is not configured", { status: 503 });
      }

      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code", { status: 400 });
      }

      try {
        // Exchange code for access token
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
            {
              status: 400,
            },
          );
        }

        // Get user info
        const userRes = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = (await userRes.json()) as {
          login: string;
          name: string;
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
            Location: "/",
            "Set-Cookie": `jam_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${getSecureCookieAttribute(req)}`,
          },
        });
      } catch (err: any) {
        console.error("OAuth callback error:", err);
        return new Response("OAuth error: " + err.message, { status: 500 });
      }
    }

    // --- Logout ---
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

    // --- Create a Jam (auth required) ---
    if (url.pathname === "/api/jams" && req.method === "POST") {
      const user = getUser(req);
      if (!user) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
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
            { status: 500 },
          );
        }

        const ip = await waitForPublicIp(instanceId);

        return Response.json({
          id: jamId,
          instanceId,
          url: `http://${ip}:7681`,
        });
      } catch (err: any) {
        console.error("POST /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500 },
        );
      }
    }

    // --- List Jams ---
    if (url.pathname === "/api/jams" && req.method === "GET") {
      try {
        const jams = await listJamInstances();
        return Response.json(
          jams.map((j) => ({
            id: j.id,
            instanceId: j.instanceId,
            url: j.ip ? `http://${j.ip}:7681` : null,
            state: j.state,
          })),
        );
      } catch (err: any) {
        console.error("GET /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500 },
        );
      }
    }

    // --- Delete a Jam ---
    const deleteMatch = url.pathname.match(/^\/api\/jams\/([a-z0-9]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const jamId = deleteMatch[1];
      try {
        const jams = await listJamInstances();
        const jam = jams.find((j) => j.id === jamId);
        if (!jam) {
          return Response.json({ error: "Jam not found" }, { status: 404 });
        }

        await ec2.send(
          new TerminateInstancesCommand({ InstanceIds: [jam.instanceId] }),
        );

        return Response.json({ ok: true, terminated: jam.instanceId });
      } catch (err: any) {
        console.error("DELETE /api/jams error:", err);
        return Response.json(
          { error: err.message || "Internal error" },
          { status: 500 },
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Jam lobby running on http://localhost:${PORT}`);
