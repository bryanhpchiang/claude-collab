import { Template, defaultBuildLogger, waitForTimeout } from "e2b";

export type BuildE2bTemplateOptions = {
  templateName: string;
  apiKey: string;
  domain: string;
  repoUrl: string;
  repoRef: string;
  installDir: string;
  gitUserName: string;
  gitUserEmail: string;
};

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildTemplateCheckoutCommands({
  repoUrl,
  repoRef,
  installDir,
}: Pick<BuildE2bTemplateOptions, "repoUrl" | "repoRef" | "installDir">) {
  return [
    `git init -q ${shellQuote(installDir)}`,
    `git -C ${shellQuote(installDir)} remote add origin ${shellQuote(repoUrl)}`,
    `git -C ${shellQuote(installDir)} fetch --depth 1 origin ${shellQuote(repoRef)}`,
    `git -C ${shellQuote(installDir)} checkout --detach FETCH_HEAD`,
  ];
}

export function buildTemplateBuildCommands({
  repoUrl,
  repoRef,
  installDir,
  gitUserName,
  gitUserEmail,
}: Pick<
  BuildE2bTemplateOptions,
  "repoUrl" | "repoRef" | "installDir" | "gitUserName" | "gitUserEmail"
>) {
  return [
    "mkdir -p /etc/apt/keyrings",
    "curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg",
    `echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list`,
    "apt-get update && DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes apt-get install -y --no-install-recommends nodejs",
    "curl -fsSL https://bun.sh/install | bash",
    "ln -sf /root/.bun/bin/bun /usr/local/bin/bun",
    "npm install -g @anthropic-ai/claude-code",
    ...buildTemplateCheckoutCommands({ repoUrl, repoRef, installDir }),
    `cd ${shellQuote(installDir)} && bun install --frozen-lockfile --production --filter @jam/runtime`,
    `cd ${shellQuote(installDir)} && bun run runtime:web:build`,
    `git config --global user.name ${shellQuote(gitUserName)}`,
    `git config --global user.email ${shellQuote(gitUserEmail)}`,
  ];
}

export function loadBuildE2bTemplateOptions(
  env: NodeJS.ProcessEnv = process.env,
): BuildE2bTemplateOptions {
  return {
    templateName: env.JAM_E2B_TEMPLATE || "jam-runtime-v1",
    apiKey: env.E2B_API_KEY || "",
    domain: env.E2B_DOMAIN || "",
    repoUrl:
      env.JAM_REPO_URL ||
      "https://github.com/bryanhpchiang/claude-collab.git",
    repoRef: env.JAM_E2B_TEMPLATE_REF || "main",
    installDir: env.JAM_INSTALL_DIR || "/home/user/jam",
    gitUserName: env.JAM_GIT_USER_NAME || "Jam",
    gitUserEmail: env.JAM_GIT_USER_EMAIL || "jam@letsjam.now",
  };
}

export async function main(env: NodeJS.ProcessEnv = process.env) {
  const options = loadBuildE2bTemplateOptions(env);
  if (!options.apiKey) {
    throw new Error("E2B_API_KEY is required to build the E2B runtime template");
  }

  console.log(
    `Building E2B template ${options.templateName} from ${options.repoUrl}#${options.repoRef}`,
  );

  const template = Template()
    .fromDebianImage("bookworm-slim")
    .setUser("root")
    .setWorkdir(options.installDir)
    .aptInstall(["ca-certificates", "curl", "git", "gnupg", "unzip"], {
      noInstallRecommends: true,
    })
    .runCmd(buildTemplateBuildCommands(options))
    .setStartCmd("tail -f /dev/null", waitForTimeout(1000));

  const build = await Template.build(template, options.templateName, {
    apiKey: options.apiKey,
    ...(options.domain ? { domain: options.domain } : {}),
    onBuildLogs: defaultBuildLogger(),
  });

  console.log(JSON.stringify(build, null, 2));
}

if (import.meta.main) {
  await main();
}
