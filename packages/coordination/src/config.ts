import { join } from "path";
import { COORDINATION_WEB_CLIENT_ENTRIES } from "./web/bootstrap";
import type { JamComputeProvider } from "./services/jam-compute-types";

type CoordinationWebClientEntries = typeof COORDINATION_WEB_CLIENT_ENTRIES;

export const DEFAULT_JAM_RUNTIME_START_COMMAND =
  "JAM_MODE=instance bun run runtime:start";
export const DEFAULT_JAM_E2B_TEMPLATE = "jam-runtime-v1";
export const DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND =
  "JAM_MODE=instance bun run runtime:serve";

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
  jamComputeProvider: JamComputeProvider;
  awsRegion: string;
  jamAmiId: string;
  jamSecurityGroupId: string;
  jamInstanceType: string;
  jamTagPrefix: string;
  jamHostSuffix: string;
  jamPreviewHostSuffix: string;
  jamAlbListenerArn: string;
  jamVpcId: string;
  e2bApiKey: string;
  e2bDomain: string;
  jamE2bTemplate: string;
  jamE2bTimeoutMs: number;
  anthropicApiKey: string;
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
  const jamE2bTimeoutMs =
    process.env.JAM_E2B_TIMEOUT_MS === undefined
      ? 60 * 60 * 1000
      : Number(process.env.JAM_E2B_TIMEOUT_MS);
  const databaseUrl = process.env.DATABASE_URL || "";
  const baseUrl = process.env.BASE_URL || "";
  const databaseSslCaPath =
    process.env.DATABASE_SSL_CA_PATH ||
    process.env.PGSSLROOTCERT ||
    "/etc/ssl/certs/rds-global-bundle.pem";
  const betterAuthSecret =
    process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "";
  const e2bApiKey = process.env.E2B_API_KEY || "";
  const requestedProvider = (process.env.JAM_COMPUTE_PROVIDER || "")
    .trim()
    .toLowerCase();

  let jamComputeProvider: JamComputeProvider;
  if (requestedProvider === "") {
    jamComputeProvider = e2bApiKey ? "e2b" : "ec2";
  } else if (requestedProvider === "ec2" || requestedProvider === "e2b") {
    jamComputeProvider = requestedProvider;
  } else {
    throw new Error("JAM_COMPUTE_PROVIDER must be 'ec2' or 'e2b'");
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the coordination server");
  }

  if (!betterAuthSecret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required for the coordination server",
    );
  }

  if (!baseUrl) {
    throw new Error("BASE_URL is required for the coordination server");
  }

  if (jamComputeProvider === "e2b" && !e2bApiKey) {
    throw new Error(
      "E2B_API_KEY is required when JAM_COMPUTE_PROVIDER is 'e2b'",
    );
  }

  const defaultInstallDir =
    jamComputeProvider === "e2b" ? "/home/user/jam" : "/opt/jam";
  const e2bDomain = process.env.E2B_DOMAIN || "e2b.letsjam.now";
  const jamE2bTemplate =
    process.env.JAM_E2B_TEMPLATE ||
    (jamComputeProvider === "e2b" &&
    e2bDomain === "e2b.letsjam.now" &&
    baseUrl === "https://letsjam.now"
      ? DEFAULT_JAM_E2B_TEMPLATE
      : "");

  return {
    port: Number.isFinite(port) ? port : 8080,
    serviceName: "jam-coordination",
    staticDir: join(import.meta.dir, "..", "dist", "web"),
    webClientEntries: COORDINATION_WEB_CLIENT_ENTRIES,
    webManifestPath: join(
      import.meta.dir,
      "..",
      "dist",
      "web",
      ".vite",
      "manifest.json",
    ),
    webDevServerUrl:
      process.env.COORDINATION_WEB_DEV_SERVER_URL ||
      process.env.WEB_DEV_SERVER_URL ||
      "",
    databaseUrl,
    databaseSslCaPath,
    betterAuthSecret,
    jamRuntimePort: Number.isFinite(jamRuntimePort) ? jamRuntimePort : 7681,
    jamComputeProvider,
    awsRegion:
      process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
    jamAmiId: process.env.JAM_AMI_ID || "ami-0e8752c8e684e0997",
    jamSecurityGroupId:
      process.env.JAM_SECURITY_GROUP_ID || "sg-092ad16c7428104a3",
    jamInstanceType: process.env.JAM_INSTANCE_TYPE || "t3.medium",
    jamTagPrefix: process.env.JAM_TAG_PREFIX || "jam-",
    jamHostSuffix: process.env.JAM_HOST_SUFFIX || "jams.letsjam.now",
    jamPreviewHostSuffix:
      process.env.JAM_PREVIEW_HOST_SUFFIX || "previews.letsjam.now",
    jamAlbListenerArn: process.env.JAM_ALB_LISTENER_ARN || "",
    jamVpcId: process.env.JAM_VPC_ID || "",
    e2bApiKey,
    e2bDomain,
    jamE2bTemplate,
    jamE2bTimeoutMs: Number.isFinite(jamE2bTimeoutMs)
      ? jamE2bTimeoutMs
      : 60 * 60 * 1000,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    githubClientId: process.env.GITHUB_CLIENT_ID || "",
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
    baseUrl,
    jamRepoUrl:
      process.env.JAM_REPO_URL ||
      "https://github.com/bryanhpchiang/claude-collab.git",
    jamInstallDir: process.env.JAM_INSTALL_DIR || defaultInstallDir,
    jamGitUserName: process.env.JAM_GIT_USER_NAME || "Jam",
    jamGitUserEmail: process.env.JAM_GIT_USER_EMAIL || "jam@letsjam.now",
    jamRuntimeStartCommand:
      process.env.JAM_RUNTIME_START_COMMAND ||
      DEFAULT_JAM_RUNTIME_START_COMMAND,
  };
}
