import { Sandbox } from "e2b";
import {
  E2B_TRAFFIC_ACCESS_TOKEN_HEADER,
  buildE2bPublicHost,
  buildJamPublicHost,
} from "shared";
import {
  DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND,
  DEFAULT_JAM_RUNTIME_START_COMMAND,
  type CoordinationConfig,
} from "../config";
import {
  type JamComputeClient,
  type JamEnvironmentHandle,
  type JamRuntimeStatus,
} from "./jam-compute-types";
import { buildJamRuntimeEnvVars, shellQuote } from "./jam-runtime";

function getErrorName(error: unknown) {
  return typeof error === "object" && error && "name" in error
    ? String(error.name)
    : "";
}

function getErrorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String(error.message)
    : "";
}

function isSandboxNotFound(error: unknown) {
  const name = getErrorName(error);
  const message = getErrorMessage(error);
  return (
    name === "SandboxNotFoundError" || message.includes("sandbox not found")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRuntimeHealth(
  publicHost: string,
  trafficAccessToken?: string,
) {
  try {
    const response = await fetch(`https://${publicHost}/health`, {
      headers: trafficAccessToken
        ? { [E2B_TRAFFIC_ACCESS_TOKEN_HEADER]: trafficAccessToken }
        : undefined,
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function buildE2bBootstrapScript(
  config: CoordinationConfig,
) {
  const installDir = shellQuote(config.jamInstallDir);
  const repoUrl = shellQuote(config.jamRepoUrl);
  const gitUserName = shellQuote(config.jamGitUserName);
  const gitUserEmail = shellQuote(config.jamGitUserEmail);
  const startCommand = shellQuote(
    `${config.jamRuntimeStartCommand} > /tmp/jam-runtime.log 2>&1`,
  );

  return `#!/bin/bash
set -euxo pipefail
export HOME="\${HOME:-/home/user}"
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export PATH="/usr/local/bin:$NPM_CONFIG_PREFIX/bin:$HOME/.bun/bin:/root/.bun/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="/usr/local/bin:$NPM_CONFIG_PREFIX/bin:$HOME/.bun/bin:/root/.bun/bin:$PATH"
fi
if ! command -v claude >/dev/null 2>&1; then
  mkdir -p "$NPM_CONFIG_PREFIX"
  npm install -g @anthropic-ai/claude-code
fi
if [ ! -d ${installDir}/.git ]; then
  mkdir -p "$(dirname ${installDir})"
  git clone ${repoUrl} ${installDir}
fi
git -C ${installDir} config user.name ${gitUserName}
git -C ${installDir} config user.email ${gitUserEmail}
if [ -z "$(git -C ${installDir} status --porcelain)" ]; then
  git -C ${installDir} pull --ff-only origin main || true
fi
cd ${installDir}
bun install --frozen-lockfile
exec /bin/bash -c ${startCommand}
`;
}

function resolveTemplateRuntimeStartCommand(config: CoordinationConfig) {
  return config.jamRuntimeStartCommand === DEFAULT_JAM_RUNTIME_START_COMMAND
    ? DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND
    : config.jamRuntimeStartCommand;
}

export function buildE2bTemplateLaunchScript(config: CoordinationConfig) {
  const installDir = shellQuote(config.jamInstallDir);
  const gitUserName = shellQuote(config.jamGitUserName);
  const gitUserEmail = shellQuote(config.jamGitUserEmail);
  const startCommand = shellQuote(
    `${resolveTemplateRuntimeStartCommand(config)} > /tmp/jam-runtime.log 2>&1`,
  );

  return `#!/bin/bash
set -euxo pipefail
export HOME="\${HOME:-/home/user}"
export PATH="/usr/local/bin:$HOME/.bun/bin:/root/.bun/bin:$PATH"
if [ ! -d ${installDir} ]; then
  echo "Missing jam runtime template contents at ${config.jamInstallDir}" >&2
  exit 1
fi
git -C ${installDir} config user.name ${gitUserName}
git -C ${installDir} config user.email ${gitUserEmail}
if [ -z "$(git -C ${installDir} status --porcelain)" ]; then
  git -C ${installDir} pull --ff-only origin main || true
fi
cd ${installDir}
bun install --frozen-lockfile --filter @jam/runtime
exec /bin/bash -c ${startCommand}
`;
}

export function createE2bComputeClient(
  config: CoordinationConfig,
): JamComputeClient {
  function getConnectionOpts() {
    return {
      apiKey: config.e2bApiKey,
      domain: config.e2bDomain,
    };
  }

  async function getSandboxStatus(targetId: string) {
    try {
      const info = await Sandbox.getInfo(targetId, getConnectionOpts());
      return info;
    } catch (error) {
      if (isSandboxNotFound(error)) return null;
      throw error;
    }
  }

  return {
    provider: "e2b",

    async launchJamEnvironment(jamId, launchConfig) {
      const publicHost = buildJamPublicHost(jamId, config.jamHostSuffix);
      const runtimeEnv = {
        ...launchConfig,
        publicHost,
      };
      const launchScript = config.jamE2bTemplate
        ? buildE2bTemplateLaunchScript(config)
        : buildE2bBootstrapScript(config);
      const sandboxOpts = {
        ...getConnectionOpts(),
        secure: true,
        timeoutMs: config.jamE2bTimeoutMs,
        lifecycle: {
          onTimeout: "pause" as const,
          autoResume: true,
        },
        metadata: {
          jamId,
          provider: "e2b",
        },
        envs: buildJamRuntimeEnvVars(config, runtimeEnv),
      };
      const sandbox = config.jamE2bTemplate
        ? await Sandbox.create(config.jamE2bTemplate, sandboxOpts)
        : await Sandbox.create(sandboxOpts);

      await sandbox.commands.run(
        `/bin/bash -lc ${shellQuote(launchScript)}`,
        {
          background: true,
          timeoutMs: config.jamE2bTimeoutMs,
        },
      );

      return {
        provider: "e2b",
        targetId: sandbox.sandboxId,
        publicHost,
        trafficAccessToken: sandbox.trafficAccessToken,
      };
    },

    async destroyJamEnvironment(handle: JamEnvironmentHandle) {
      await Sandbox.kill(handle.targetId, getConnectionOpts()).catch(
        (error) => {
          if (isSandboxNotFound(error)) return false;
          throw error;
        },
      );
    },

    async getRuntimeStatus(
      handle: JamEnvironmentHandle,
    ): Promise<JamRuntimeStatus> {
      const info = await getSandboxStatus(handle.targetId);
      if (!info) {
        return "terminated";
      }

      const upstreamHost = buildE2bPublicHost(
        handle.targetId,
        config.jamRuntimePort,
        config.e2bDomain,
      );

      if (await fetchRuntimeHealth(upstreamHost, handle.trafficAccessToken)) {
        return "running";
      }

      if (info.state === "paused") {
        await sleep(500);
        if (
          await fetchRuntimeHealth(upstreamHost, handle.trafficAccessToken)
        ) {
          return "running";
        }
      }

      return "pending";
    },
  };
}
