import { describe, expect, test } from "bun:test";
import {
  DEFAULT_JAM_E2B_TEMPLATE,
  DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND,
  loadConfig,
} from "../src/config";

const COORDINATION_ENV_KEYS = [
  "PORT",
  "JAM_RUNTIME_PORT",
  "DATABASE_URL",
  "DATABASE_SSL_CA_PATH",
  "PGSSLROOTCERT",
  "BETTER_AUTH_SECRET",
  "AUTH_SECRET",
  "JAM_COMPUTE_PROVIDER",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "JAM_AMI_ID",
  "JAM_SECURITY_GROUP_ID",
  "JAM_INSTANCE_TYPE",
  "E2B_API_KEY",
  "E2B_DOMAIN",
  "JAM_E2B_TEMPLATE",
  "JAM_E2B_TIMEOUT_MS",
  "JAM_TAG_PREFIX",
  "JAM_HOST_SUFFIX",
  "JAM_PREVIEW_HOST_SUFFIX",
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

  test("prefers E2B when credentials are configured", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
        BASE_URL: "https://letsjam.now",
        E2B_API_KEY: "test-e2b-key",
      },
      () => {
        expect(loadConfig().jamComputeProvider).toBe("e2b");
      },
    );
  });

  test("defaults the jam E2B template for the production E2B environment", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
        BASE_URL: "https://letsjam.now",
        E2B_API_KEY: "test-e2b-key",
      },
      () => {
        expect(loadConfig().jamE2bTemplate).toBe(DEFAULT_JAM_E2B_TEMPLATE);
      },
    );
  });

  test("prefers an explicit jam E2B template from the environment", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
        BASE_URL: "https://letsjam.now",
        E2B_API_KEY: "test-e2b-key",
        JAM_E2B_TEMPLATE: "jam-runtime-abcdef123456",
      },
      () => {
        expect(loadConfig().jamE2bTemplate).toBe("jam-runtime-abcdef123456");
      },
    );
  });

  test("does not force the production template for non-production base urls", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
        BASE_URL: "http://localhost:3000",
        E2B_API_KEY: "test-e2b-key",
      },
      () => {
        expect(loadConfig().jamE2bTemplate).toBe("");
      },
    );
  });

  test("loads the preview host suffix", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
        BASE_URL: "https://letsjam.now",
        JAM_PREVIEW_HOST_SUFFIX: "previews.letsjam.now",
      },
      () => {
        expect(loadConfig().jamPreviewHostSuffix).toBe(
          "previews.letsjam.now",
        );
      },
    );
  });

  test("requires E2B credentials when the provider is forced to e2b", () => {
    withCoordinationEnv(
      {
        DATABASE_URL: "postgresql://jam:jam@localhost:5432/jam",
        BETTER_AUTH_SECRET: "test-secret",
        BASE_URL: "https://letsjam.now",
        JAM_COMPUTE_PROVIDER: "e2b",
      },
      () => {
        expect(() => loadConfig()).toThrow(
          "E2B_API_KEY is required when JAM_COMPUTE_PROVIDER is 'e2b'",
        );
      },
    );
  });

  test("builds web assets before starting the coordination package", async () => {
    const pkg = (await Bun.file(
      new URL("../package.json", import.meta.url),
    ).json()) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.start).toContain("web:build");
    expect(pkg.scripts?.dev).toContain("web:build");
  });

  test("uses the runtime start script for E2B template launches", () => {
    expect(DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND).toContain("bun run runtime:serve");
    expect(DEFAULT_JAM_E2B_TEMPLATE_START_COMMAND).not.toContain("src/index.ts");
  });
});
