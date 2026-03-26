import { describe, expect, test } from "bun:test";
import type { JamProxyConfig } from "../src/config";
import {
  buildUpstreamTarget,
  resolveRequestTarget,
} from "../src/routing";

const config: JamProxyConfig = {
  port: 8090,
  serviceName: "jam-proxy",
  databaseUrl: "postgresql://jam:jam@localhost:5432/jam",
  databaseSslCaPath: "/tmp/rds.pem",
  jamHostSuffix: "jams.letsjam.now",
  jamPreviewHostSuffix: "previews.letsjam.now",
  jamRuntimePort: 7681,
  e2bDomain: "e2b.letsjam.now",
};

describe("buildUpstreamTarget", () => {
  test("builds secure E2B upstreams with traffic tokens", () => {
    expect(
      buildUpstreamTarget(
        {
          provider: "e2b",
          targetId: "sandbox-123",
          trafficAccessToken: "traffic-token",
          port: 3000,
        },
        config,
      ),
    ).toEqual({
      target: "https://3000-sandbox-123.e2b.letsjam.now",
      headers: {
        "e2b-traffic-access-token": "traffic-token",
      },
    });
  });

  test("builds EC2 upstreams from instance IPs", () => {
    expect(
      buildUpstreamTarget(
        {
          provider: "ec2",
          targetId: "i-123",
          ip: "10.0.0.15",
          port: 7681,
        },
        config,
      ),
    ).toEqual({
      target: "http://10.0.0.15:7681",
    });
  });
});

describe("resolveRequestTarget", () => {
  const lookup = {
    async getJamRoute(jamId: string) {
      if (jamId !== "abc123") return undefined;
      return {
        provider: "e2b" as const,
        targetId: "sandbox-123",
        trafficAccessToken: "traffic-token",
        port: 7681,
      };
    },
    async getPreviewRoute(host: string) {
      if (host !== "preview1.previews.letsjam.now") return undefined;
      return {
        provider: "e2b" as const,
        targetId: "sandbox-123",
        trafficAccessToken: "traffic-token",
        port: 3000,
      };
    },
  };

  test("resolves jam hosts through jam ids", async () => {
    await expect(
      resolveRequestTarget("abc123.jams.letsjam.now", config, lookup),
    ).resolves.toEqual({
      target: "https://7681-sandbox-123.e2b.letsjam.now",
      headers: {
        "e2b-traffic-access-token": "traffic-token",
      },
    });
  });

  test("resolves preview hosts by full hostname", async () => {
    await expect(
      resolveRequestTarget("preview1.previews.letsjam.now", config, lookup),
    ).resolves.toEqual({
      target: "https://3000-sandbox-123.e2b.letsjam.now",
      headers: {
        "e2b-traffic-access-token": "traffic-token",
      },
    });
  });

  test("returns undefined for unknown hosts", async () => {
    await expect(
      resolveRequestTarget("unknown.letsjam.now", config, lookup),
    ).resolves.toBeUndefined();
  });
});
