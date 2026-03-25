import { describe, expect, test } from "bun:test";
import type { CoordinationConfig } from "../config";
import { buildJamInstanceUserData, buildJamInstanceUserDataScript } from "./user-data";

const config: CoordinationConfig = {
  port: 8080,
  serviceName: "jam-coordination",
  staticDir: "/tmp/static",
  databaseUrl: "postgres://jam:jam@localhost:5432/jam",
  databaseSslCaPath: "/tmp/rds-global-bundle.pem",
  betterAuthSecret: "test-secret",
  jamRuntimePort: 7681,
  awsRegion: "us-east-1",
  jamAmiId: "ami-123",
  jamSecurityGroupId: "sg-123",
  jamInstanceType: "t3.medium",
  jamTagPrefix: "jam-",
  jamHostSuffix: "jams.letsjam.now",
  jamAlbListenerArn: "arn:aws:elasticloadbalancing:listener/app/jam/123/listener",
  jamVpcId: "vpc-123",
  githubClientId: "",
  githubClientSecret: "",
  githubWebhookSecret: "",
  baseUrl: "",
  jamRepoUrl: "https://github.com/bryanhpchiang/claude-collab.git",
  jamInstallDir: "/opt/jam",
  jamGitUserName: "Jam",
  jamGitUserEmail: "jam@letsjam.now",
  jamRuntimeStartCommand: "JAM_MODE=instance bun run start",
};

describe("buildJamInstanceUserDataScript", () => {
  test("configures git identity as the ubuntu user after chowning the repo", () => {
    const script = buildJamInstanceUserDataScript(config, {
      jamId: "abc123",
      publicHost: "abc123.jams.letsjam.now",
      sharedSecret: "shared-secret",
      deploySecret: "deploy-secret",
    });

    expect(script).toContain("chown -R ubuntu:ubuntu /opt/jam");
    expect(script).toContain(
      `su - ubuntu -c "git config --global user.name 'Jam' && git config --global user.email 'jam@letsjam.now'`,
    );
    expect(script).toContain("bun install --frozen-lockfile");
    expect(script).toContain("JAM_MODE=instance bun run start");
    expect(script).toContain("export JAM_ID='abc123' JAM_PUBLIC_HOST='abc123.jams.letsjam.now'");
    expect(script).not.toContain("\ngit config user.name ");
    expect(script).not.toContain("\ngit config user.email ");
  });

  test("encodes the script as base64 for EC2 user data", () => {
    const runtimeEnv = {
      jamId: "abc123",
      publicHost: "abc123.jams.letsjam.now",
      sharedSecret: "shared-secret",
      deploySecret: "deploy-secret",
    };
    const encoded = buildJamInstanceUserData(config, runtimeEnv);
    const decoded = Buffer.from(encoded, "base64").toString("utf8");

    expect(decoded).toBe(buildJamInstanceUserDataScript(config, runtimeEnv));
  });
});
