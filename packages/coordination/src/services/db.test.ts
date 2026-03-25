import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { CoordinationConfig } from "../config";
import { buildDatabasePoolConfig, stripDatabaseSslParams } from "./db";

const baseConfig: CoordinationConfig = {
  port: 8080,
  serviceName: "jam-coordination",
  staticDir: "/tmp/static",
  databaseUrl: "postgresql://jam:jam@localhost:5432/jam",
  databaseSslCaPath: "",
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

describe("stripDatabaseSslParams", () => {
  test("removes ssl query params so pg uses the explicit ssl config", () => {
    expect(
      stripDatabaseSslParams(
        "postgresql://jam:jam@example.com:5432/jam?sslmode=require&sslrootcert=/tmp/rds.pem&application_name=jam",
      ),
    ).toBe(
      "postgresql://jam:jam@example.com:5432/jam?application_name=jam",
    );
  });
});

describe("buildDatabasePoolConfig", () => {
  test("loads the configured CA bundle when it exists", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "jam-db-"));
    const caPath = join(tempDir, "rds-ca.pem");
    writeFileSync(caPath, "test-rds-ca");

    try {
      const poolConfig = buildDatabasePoolConfig({
        ...baseConfig,
        databaseUrl:
          "postgresql://jam:jam@example.com:5432/jam?sslmode=require",
        databaseSslCaPath: caPath,
      });

      expect(poolConfig.connectionString).toBe(
        "postgresql://jam:jam@example.com:5432/jam",
      );
      expect(poolConfig.ssl).toEqual({
        rejectUnauthorized: true,
        ca: "test-rds-ca",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("keeps certificate validation enabled when no bundle path is available", () => {
    const poolConfig = buildDatabasePoolConfig({
      ...baseConfig,
      databaseSslCaPath: "/tmp/does-not-exist.pem",
    });

    expect(poolConfig.ssl).toEqual({
      rejectUnauthorized: true,
    });
  });
});
