import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config";

const COORDINATION_ENV_KEYS = [
  "PORT",
  "JAM_RUNTIME_PORT",
  "DATABASE_URL",
  "DATABASE_SSL_CA_PATH",
  "PGSSLROOTCERT",
  "BETTER_AUTH_SECRET",
  "AUTH_SECRET",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "JAM_AMI_ID",
  "JAM_SECURITY_GROUP_ID",
  "JAM_INSTANCE_TYPE",
  "JAM_TAG_PREFIX",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_WEBHOOK_SECRET",
  "BASE_URL",
  "JAM_REPO_URL",
  "JAM_INSTALL_DIR",
  "JAM_GIT_USER_NAME",
  "JAM_GIT_USER_EMAIL",
  "JAM_RUNTIME_START_COMMAND",
] as const;

function withCoordinationEnv(
  overrides: Partial<Record<(typeof COORDINATION_ENV_KEYS)[number], string>>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();

  for (const key of COORDINATION_ENV_KEYS) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const key of COORDINATION_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("loadConfig", () => {
  test("requires BASE_URL for the coordination server", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
      },
      () => {
        expect(() => loadConfig()).toThrow(
          "BASE_URL is required for the coordination server",
        );
      },
    );
  });

  test("uses the configured BASE_URL for auth and redirects", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
        BASE_URL: "https://letsjam.now",
      },
      () => {
        expect(loadConfig().baseUrl).toBe("https://letsjam.now");
      },
    );
  });

  test("builds web assets before starting the coordination package", async () => {
    const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json() as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.start).toContain("web:build");
    expect(pkg.scripts?.dev).toContain("web:build");
  });
});
