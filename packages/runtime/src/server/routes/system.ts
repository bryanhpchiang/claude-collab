import { HOME_DIR, JAM_DEPLOY_SECRET, WORKSPACE_ROOT } from "../../config";
import { DEPLOY_HEADER_NAME } from "../runtime-auth";
import type { RuntimeStore } from "../runtime-store";

type RuntimeCommand = {
  label: string;
  args: string[];
  cwd: string;
};

function getBunExecutable() {
  return process.execPath || `${HOME_DIR}/.bun/bin/bun`;
}

function getDeploySecret() {
  return process.env.JAM_DEPLOY_SECRET || JAM_DEPLOY_SECRET;
}

export function getRuntimeDeploySteps(bunPath = getBunExecutable()): RuntimeCommand[] {
  return [
    {
      label: "pull latest code",
      args: ["git", "pull", "origin", "main"],
      cwd: WORKSPACE_ROOT,
    },
    {
      label: "install dependencies",
      args: [bunPath, "install", "--frozen-lockfile"],
      cwd: WORKSPACE_ROOT,
    },
  ];
}

export function getRuntimeStartCommand(bunPath = getBunExecutable()): RuntimeCommand {
  return {
    label: "restart runtime",
    args: [bunPath, "run", "runtime:start"],
    cwd: WORKSPACE_ROOT,
  };
}

async function runCommand(command: RuntimeCommand) {
  const proc = Bun.spawn(command.args, {
    cwd: command.cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function deployLatestRuntime() {
  for (const step of getRuntimeDeploySteps()) {
    const result = await runCommand(step);
    if (result.exitCode !== 0) {
      return {
        ok: false as const,
        status: 500,
        error: `${step.label} failed`,
        ...result,
      };
    }
  }

  const startCommand = getRuntimeStartCommand();
  const shellCmd = `sleep 1 && ${startCommand.args.map((a) => `'${a}'`).join(" ")}`;
  const child = Bun.spawn(["bash", "-c", shellCmd], {
    cwd: startCommand.cwd,
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });
  child.unref();
  setTimeout(() => process.exit(0), 200);

  return { ok: true as const };
}

export async function handleSystemRoute(req: Request, url: URL, store: RuntimeStore) {
  if (url.pathname === "/health" && req.method === "GET") {
    return Response.json({ ok: true });
  }

  if (url.pathname === "/api/state-summary" && req.method === "GET") {
    return Response.json(store.buildStateSummary());
  }

  if (url.pathname === "/api/deploy" && req.method === "POST") {
    const deploySecret = getDeploySecret();
    const sharedSecret = req.headers.get(DEPLOY_HEADER_NAME) || "";
    if (!deploySecret || sharedSecret !== deploySecret) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const result = await deployLatestRuntime();
    if (!result.ok) {
      console.error("[deploy] runtime rollout failed", {
        error: result.error,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
      return Response.json(
        {
          error: result.error,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
        { status: result.status },
      );
    }
    return Response.json({ ok: true, deployed: true, restarting: true });
  }

  return null;
}
