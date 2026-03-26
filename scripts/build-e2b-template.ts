import { Template, defaultBuildLogger, waitForTimeout } from "e2b";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

const templateName = process.env.JAM_E2B_TEMPLATE || "jam-runtime-v1";
const apiKey = process.env.E2B_API_KEY || "";
const domain = process.env.E2B_DOMAIN || "";
const repoUrl =
  process.env.JAM_REPO_URL ||
  "https://github.com/bryanhpchiang/claude-collab.git";
const repoRef = process.env.JAM_E2B_TEMPLATE_REF || "main";
const installDir = process.env.JAM_INSTALL_DIR || "/home/user/jam";
const gitUserName = process.env.JAM_GIT_USER_NAME || "Jam";
const gitUserEmail = process.env.JAM_GIT_USER_EMAIL || "jam@letsjam.now";
const buildToolsDir = "/tmp/jam-runtime-build-tools";

if (!apiKey) {
  throw new Error("E2B_API_KEY is required to build the E2B runtime template");
}

console.log(
  `Building E2B template ${templateName} from ${repoUrl}#${repoRef}`,
);

const template = Template()
  .fromDebianImage("bookworm-slim")
  .setUser("root")
  .setWorkdir(installDir)
  .aptInstall(["ca-certificates", "curl", "git", "gnupg", "unzip"], {
    noInstallRecommends: true,
  })
  .runCmd([
    "mkdir -p /etc/apt/keyrings",
    "curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg",
    `echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list`,
    "apt-get update && DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes apt-get install -y --no-install-recommends nodejs",
    "curl -fsSL https://bun.sh/install | bash",
    "ln -sf /root/.bun/bin/bun /usr/local/bin/bun",
    "npm install -g @anthropic-ai/claude-code",
    `git clone --branch ${shellQuote(repoRef)} --depth 1 ${shellQuote(repoUrl)} ${shellQuote(installDir)}`,
    `cd ${shellQuote(installDir)} && bun install --frozen-lockfile --production --filter @jam/runtime`,
    `rm -rf ${shellQuote(buildToolsDir)}`,
    `npm install --prefix ${shellQuote(buildToolsDir)} --no-save vite@5.4.14 @vitejs/plugin-react@4.3.4 typescript@6.0.2`,
    `mkdir -p ${shellQuote(`${installDir}/node_modules`)} ${shellQuote(`${installDir}/node_modules/@vitejs`)}`,
    `ln -sfn ${shellQuote(`${buildToolsDir}/node_modules/vite`)} ${shellQuote(`${installDir}/node_modules/vite`)}`,
    `ln -sfn ${shellQuote(`${buildToolsDir}/node_modules/@vitejs/plugin-react`)} ${shellQuote(`${installDir}/node_modules/@vitejs/plugin-react`)}`,
    `ln -sfn ${shellQuote(`${buildToolsDir}/node_modules/typescript`)} ${shellQuote(`${installDir}/node_modules/typescript`)}`,
    `cd ${shellQuote(installDir)} && bun run runtime:web:build`,
    `rm -rf ${shellQuote(`${installDir}/node_modules/vite`)} ${shellQuote(`${installDir}/node_modules/typescript`)} ${shellQuote(`${installDir}/node_modules/@vitejs`)} ${shellQuote(buildToolsDir)}`,
    `git config --global user.name ${shellQuote(gitUserName)}`,
    `git config --global user.email ${shellQuote(gitUserEmail)}`,
  ])
  .setStartCmd("tail -f /dev/null", waitForTimeout(1000));

const build = await Template.build(template, templateName, {
  apiKey,
  ...(domain ? { domain } : {}),
  onBuildLogs: defaultBuildLogger(),
});

console.log(JSON.stringify(build, null, 2));
