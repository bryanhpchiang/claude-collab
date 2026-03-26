import { describe, expect, test } from "bun:test";
import {
  DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND,
  DEFAULT_JAM_RUNTIME_START_COMMAND,
  type CoordinationConfig,
} from "../../src/config";
import {
  buildE2bBootstrapScript,
  buildE2bTemplateLaunchScript,
} from "../../src/services/e2b";

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
  jamRuntimeStartCommand: DEFAULT_JAM_RUNTIME_START_COMMAND,
};

describe("buildE2bBootstrapScript", () => {
  test("installs bun and claude before starting the runtime from a generic sandbox", () => {
    const script = buildE2bBootstrapScript(config);

    expect(script).toContain('export NPM_CONFIG_PREFIX="$HOME/.npm-global"');
    expect(script).toContain(
      'export PATH="/usr/local/bin:$NPM_CONFIG_PREFIX/bin:$HOME/.bun/bin:/root/.bun/bin:$PATH"',
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
    expect(script).not.toContain("JAM_SHARED_SECRET");
    expect(script).toContain(
      "exec /bin/bash -c 'JAM_MODE=instance bun run runtime:start > /tmp/jam-runtime.log 2>&1'",
    );
  });
});

describe("buildE2bTemplateLaunchScript", () => {
  test("refreshes template code before starting the runtime", () => {
    const script = buildE2bTemplateLaunchScript(config);

    expect(script).toContain(
      'export PATH="/usr/local/bin:$HOME/.bun/bin:/root/.bun/bin:$PATH"',
    );
    expect(script).toContain(
      'echo "Missing jam runtime template contents at /home/user/jam" >&2',
    );
    expect(script).toContain("git -C '/home/user/jam' config user.name 'Jam'");
    expect(script).toContain("git -C '/home/user/jam' config user.email 'jam@letsjam.now'");
    expect(script).toContain(
      "git -C '/home/user/jam' pull --ff-only origin main || true",
    );
    expect(script).not.toContain("npm install -g @anthropic-ai/claude-code");
    expect(script).not.toContain("git clone");
    expect(script).toContain("bun install --frozen-lockfile --filter @jam/runtime");
    expect(DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND).toContain("bun run runtime:start");
    expect(script).toContain(
      `exec /bin/bash -c '${DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND} > /tmp/jam-runtime.log 2>&1'`,
    );
  });

  test("preserves an explicit runtime start command for template launches", () => {
    const script = buildE2bTemplateLaunchScript({
      ...config,
      jamRuntimeStartCommand: "JAM_MODE=instance bun run custom:start",
    });

    expect(script).toContain(
      "exec /bin/bash -c 'JAM_MODE=instance bun run custom:start > /tmp/jam-runtime.log 2>&1'",
    );
  });
});
