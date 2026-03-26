import { describe, expect, test } from "bun:test";
import type { CoordinationConfig } from "../../src/config";
import { buildE2bBootstrapScript } from "../../src/services/e2b";

const config: CoordinationConfig = {
  port: 8080,
  serviceName: "jam-coordination",
  staticDir: "/tmp/static",
  databaseUrl: "postgres://jam:jam@localhost:5432/jam",
  databaseSslCaPath: "/tmp/rds-global-bundle.pem",
  betterAuthSecret: "test-secret",
  jamRuntimePort: 7681,
  jamComputeProvider: "e2b",
  awsRegion: "us-east-1",
  jamAmiId: "ami-123",
  jamSecurityGroupId: "sg-123",
  jamInstanceType: "t3.medium",
  jamTagPrefix: "jam-",
  jamHostSuffix: "jams.letsjam.now",
  jamPreviewHostSuffix: "previews.letsjam.now",
  jamAlbListenerArn:
    "arn:aws:elasticloadbalancing:listener/app/jam/123/listener",
  jamVpcId: "vpc-123",
  e2bApiKey: "e2b-test",
  e2bDomain: "e2b.letsjam.now",
  jamE2bTemplate: "",
  jamE2bTimeoutMs: 60 * 60 * 1000,
  githubClientId: "",
  githubClientSecret: "",
  githubWebhookSecret: "",
  baseUrl: "https://letsjam.now",
  jamRepoUrl: "https://github.com/bryanhpchiang/claude-collab.git",
  jamInstallDir: "/home/user/jam",
  jamGitUserName: "Jam",
  jamGitUserEmail: "jam@letsjam.now",
  jamRuntimeStartCommand: "JAM_MODE=instance bun run runtime:start",
};

describe("buildE2bBootstrapScript", () => {
  test("installs bun and claude into user-writable locations before starting the runtime", () => {
    const script = buildE2bBootstrapScript(config, {
      jamId: "abc123",
      publicHost: "abc123.jams.letsjam.now",
      sharedSecret: "shared-secret",
      deploySecret: "deploy-secret",
    });

    expect(script).toContain('export NPM_CONFIG_PREFIX="$HOME/.npm-global"');
    expect(script).toContain(
      'export PATH="$NPM_CONFIG_PREFIX/bin:$HOME/.bun/bin:$PATH"',
    );
    expect(script).toContain("curl -fsSL https://bun.sh/install | bash");
    expect(script).toContain("npm install -g @anthropic-ai/claude-code");
    expect(script).toContain(
      "git clone 'https://github.com/bryanhpchiang/claude-collab.git' '/home/user/jam'",
    );
    expect(script).toContain(
      "git -C '/home/user/jam' pull --ff-only origin main || true",
    );
    expect(script).toContain("bun install --frozen-lockfile");
    expect(script).toContain(
      "export JAM_ID='abc123' JAM_PUBLIC_HOST='abc123.jams.letsjam.now'",
    );
    expect(script).toContain(
      "exec /bin/bash -c 'JAM_MODE=instance bun run runtime:start > /tmp/jam-runtime.log 2>&1'",
    );
  });
});
