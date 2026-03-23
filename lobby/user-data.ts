const JAM_REPO_URL = "https://github.com/bryanhpchiang/claude-collab.git";
const JAM_GIT_USER_NAME = "Jam";
const JAM_GIT_USER_EMAIL = "jam@letsjam.now";

export function buildJamInstanceUserDataScript() {
  return `#!/bin/bash
set -ex
# Install bun for ubuntu user if missing
if [ ! -f /home/ubuntu/.bun/bin/bun ]; then
  apt-get update && apt-get install -y curl git unzip
  su - ubuntu -c "curl -fsSL https://bun.sh/install | bash"
fi
# Install claude if missing
which claude || npm install -g @anthropic-ai/claude-code
# Clone repo if missing
if [ ! -d /opt/jam ]; then
  git clone ${JAM_REPO_URL} /opt/jam
fi
chown -R ubuntu:ubuntu /opt/jam
su - ubuntu -c "git config --global user.name '${JAM_GIT_USER_NAME}' && git config --global user.email '${JAM_GIT_USER_EMAIL}' && export PATH=/home/ubuntu/.bun/bin:\\$PATH && cd /opt/jam && git pull origin main && bun install && JAM_MODE=instance bun run server.ts &"
`;
}

export function buildJamInstanceUserData() {
  return Buffer.from(buildJamInstanceUserDataScript()).toString("base64");
}
