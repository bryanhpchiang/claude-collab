import { describe, expect, test } from "bun:test";
import {
  buildJamPath,
  buildJamRedirectUrl,
  waitForPublicIp,
} from "../../src/services/ec2";

describe("waitForPublicIp", () => {
  test("retries when a new instance is not immediately visible", async () => {
    let attempts = 0;

    const ip = await waitForPublicIp(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error(
            "The instance ID 'i-0905a2e9052ec13f6' does not exist",
          ) as Error & { name: string };
          error.name = "InvalidInstanceID.NotFound";
          throw error;
        }

        return { PublicIpAddress: "34.201.10.20" };
      },
      { maxAttempts: 3, delayMs: 0 },
    );

    expect(ip).toBe("34.201.10.20");
    expect(attempts).toBe(2);
  });

  test("throws non-retryable errors immediately", async () => {
    const error = new Error("UnauthorizedOperation") as Error & {
      name: string;
    };
    error.name = "UnauthorizedOperation";

    await expect(
      waitForPublicIp(
        async () => {
          throw error;
        },
        { maxAttempts: 3, delayMs: 0 },
      ),
    ).rejects.toBe(error);
  });
});

describe("jam links", () => {
  test("builds stable lobby paths for running jams", () => {
    expect(buildJamPath("abc123")).toBe("/j/abc123");
  });

  test("redirects lobby jam paths to the instance root while preserving query params", () => {
    expect(
      buildJamRedirectUrl(
        "abc123.jams.letsjam.now",
        "https://letsjam.now/j/abc123?s=General",
      ),
    ).toBe("https://abc123.jams.letsjam.now/?s=General");
  });
});
