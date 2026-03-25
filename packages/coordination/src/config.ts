import { join } from "path";
import {
  COORDINATION_WEB_CLIENT_ENTRIES,
} from "./web/bootstrap";

type CoordinationWebClientEntries = typeof COORDINATION_WEB_CLIENT_ENTRIES;

export type CoordinationConfig = {
  port: number;
  serviceName: string;
  staticDir: string;
  webClientEntries?: CoordinationWebClientEntries;
  webManifestPath?: string;
  webDevServerUrl?: string;
  databaseUrl: string;
  databaseSslCaPath: string;
  betterAuthSecret: string;
  jamRuntimePort: number;
  awsRegion: string;
  jamAmiId: string;
  jamSecurityGroupId: string;
  jamInstanceType: string;
  jamTagPrefix: string;
  jamHostSuffix: string;
  jamAlbListenerArn: string;
  jamVpcId: string;
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
  const databaseUrl = process.env.DATABASE_URL || "";
  const baseUrl = process.env.BASE_URL || "";
  const databaseSslCaPath =
    process.env.DATABASE_SSL_CA_PATH ||
    process.env.PGSSLROOTCERT ||
    "/etc/ssl/certs/rds-global-bundle.pem";
  const betterAuthSecret =
    process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the coordination server");
  }

  if (!betterAuthSecret) {
    throw new Error("BETTER_AUTH_SECRET is required for the coordination server");
  }

  if (!baseUrl) {
    throw new Error("BASE_URL is required for the coordination server");
  }

  return {
    port: Number.isFinite(port) ? port : 8080,
    serviceName: "jam-coordination",
    staticDir: join(import.meta.dir, "..", "dist", "web"),
    webClientEntries: COORDINATION_WEB_CLIENT_ENTRIES,
    webManifestPath: join(import.meta.dir, "..", "dist", "web", ".vite", "manifest.json"),
    webDevServerUrl:
      process.env.COORDINATION_WEB_DEV_SERVER_URL ||
      process.env.WEB_DEV_SERVER_URL ||
      "",
    databaseUrl,
    databaseSslCaPath,
    betterAuthSecret,
    jamRuntimePort: Number.isFinite(jamRuntimePort) ? jamRuntimePort : 7681,
    awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    jamAmiId: process.env.JAM_AMI_ID || "ami-0e8752c8e684e0997",
    jamSecurityGroupId:
      process.env.JAM_SECURITY_GROUP_ID || "sg-092ad16c7428104a3",
    jamInstanceType: process.env.JAM_INSTANCE_TYPE || "t3.medium",
    jamTagPrefix: process.env.JAM_TAG_PREFIX || "jam-",
    jamHostSuffix: process.env.JAM_HOST_SUFFIX || "jams.letsjam.now",
    jamAlbListenerArn: process.env.JAM_ALB_LISTENER_ARN || "",
    jamVpcId: process.env.JAM_VPC_ID || "",
    githubClientId: process.env.GITHUB_CLIENT_ID || "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    baseUrl,
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
