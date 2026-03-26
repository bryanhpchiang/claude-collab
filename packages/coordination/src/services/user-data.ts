import type { CoordinationConfig } from "../config";
import {
  buildJamRuntimeEnvVars,
  shellQuote,
  type JamRuntimeEnv,
} from "./jam-runtime";

export function buildJamInstanceUserDataScript(
  config: CoordinationConfig,
  runtimeEnv: JamRuntimeEnv,
) {
  const exports = Object.entries(buildJamRuntimeEnvVars(config, runtimeEnv))
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");

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
  return Buffer.from(
    buildJamInstanceUserDataScript(config, runtimeEnv),
  ).toString("base64");
}
