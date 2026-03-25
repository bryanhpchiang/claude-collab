import type { CoordinationConfig } from "../config";

export type JamRuntimeEnv = {
  jamId: string;
  jamName?: string;
  publicHost: string;
  sharedSecret: string;
  deploySecret: string;
};

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildJamInstanceUserDataScript(
  config: CoordinationConfig,
  runtimeEnv: JamRuntimeEnv,
) {
  const exports = [
    `JAM_ID=${shellQuote(runtimeEnv.jamId)}`,
    `JAM_PUBLIC_HOST=${shellQuote(runtimeEnv.publicHost)}`,
    `JAM_SHARED_SECRET=${shellQuote(runtimeEnv.sharedSecret)}`,
    `JAM_DEPLOY_SECRET=${shellQuote(runtimeEnv.deploySecret)}`,
    ...(runtimeEnv.jamName ? [`JAM_NAME=${shellQuote(runtimeEnv.jamName)}`] : []),
    `COORDINATION_BASE_URL=${shellQuote(config.baseUrl)}`,
  ].join(" ");

  return `#!/bin/bash
set -ex
if [ ! -f /home/ubuntu/.bun/bin/bun ]; then
  apt-get update && apt-get install -y curl git unzip
  su - ubuntu -c "curl -fsSL https://bun.sh/install | bash"
fi
which claude || npm install -g @anthropic-ai/claude-code
if [ ! -d ${config.jamInstallDir} ]; then
  git clone ${config.jamRepoUrl} ${config.jamInstallDir}
fi
chown -R ubuntu:ubuntu ${config.jamInstallDir}
su - ubuntu -c "git config --global user.name '${config.jamGitUserName}' && git config --global user.email '${config.jamGitUserEmail}' && export PATH=/home/ubuntu/.bun/bin:\\$PATH && export ${exports} && cd ${config.jamInstallDir} && git pull origin main && bun install --frozen-lockfile && ${config.jamRuntimeStartCommand} &"
`;
}

export function buildJamInstanceUserData(
  config: CoordinationConfig,
  runtimeEnv: JamRuntimeEnv,
) {
  return Buffer.from(buildJamInstanceUserDataScript(config, runtimeEnv)).toString("base64");
}
