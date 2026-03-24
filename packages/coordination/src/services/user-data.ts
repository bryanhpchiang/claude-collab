import type { CoordinationConfig } from "../config";

export function buildJamInstanceUserDataScript(config: CoordinationConfig) {
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
su - ubuntu -c "git config --global user.name '${config.jamGitUserName}' && git config --global user.email '${config.jamGitUserEmail}' && export PATH=/home/ubuntu/.bun/bin:\\$PATH && cd ${config.jamInstallDir} && git pull origin main && bun install --frozen-lockfile && ${config.jamRuntimeStartCommand} &"
`;
}

export function buildJamInstanceUserData(config: CoordinationConfig) {
  return Buffer.from(buildJamInstanceUserDataScript(config)).toString("base64");
}
