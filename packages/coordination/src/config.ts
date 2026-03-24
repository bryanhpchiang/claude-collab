import { join } from "path";

export type CoordinationConfig = {
  port: number;
  serviceName: string;
  staticDir: string;
  jamRuntimePort: number;
  awsRegion: string;
  jamAmiId: string;
  jamSecurityGroupId: string;
  jamInstanceType: string;
  jamTagPrefix: string;
  jamTableName: string;
  githubClientId: string;
  githubClientSecret: string;
  githubWebhookSecret: string;
  baseUrl: string;
  jamRepoUrl: string;
  jamInstallDir: string;
  jamGitUserName: string;
  jamGitUserEmail: string;
  jamRuntimeStartCommand: string;
};

export function loadConfig(): CoordinationConfig {
  const port = process.env.PORT === undefined ? 8080 : Number(process.env.PORT);
  const jamRuntimePort =
    process.env.JAM_RUNTIME_PORT === undefined
      ? 7681
      : Number(process.env.JAM_RUNTIME_PORT);

  return {
    port: Number.isFinite(port) ? port : 8080,
    serviceName: "jam-coordination",
    staticDir: join(import.meta.dir, "static"),
    jamRuntimePort: Number.isFinite(jamRuntimePort) ? jamRuntimePort : 7681,
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    jamAmiId: process.env.JAM_AMI_ID || "ami-0e8752c8e684e0997",
    jamSecurityGroupId:
      process.env.JAM_SECURITY_GROUP_ID || "sg-092ad16c7428104a3",
    jamInstanceType: process.env.JAM_INSTANCE_TYPE || "t3.medium",
    jamTagPrefix: process.env.JAM_TAG_PREFIX || "jam-",
    jamTableName: process.env.JAM_TABLE_NAME || "jam-instances",
    githubClientId: process.env.GITHUB_CLIENT_ID || "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    baseUrl: process.env.BASE_URL || "",
    jamRepoUrl:
      process.env.JAM_REPO_URL ||
      "https://github.com/bryanhpchiang/claude-collab.git",
    jamInstallDir: process.env.JAM_INSTALL_DIR || "/opt/jam",
    jamGitUserName: process.env.JAM_GIT_USER_NAME || "Jam",
    jamGitUserEmail: process.env.JAM_GIT_USER_EMAIL || "jam@letsjam.now",
    jamRuntimeStartCommand:
      process.env.JAM_RUNTIME_START_COMMAND || "JAM_MODE=instance bun run runtime:start",
  };
}
