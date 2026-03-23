import { describe, expect, test } from "bun:test";
import { waitForPublicIp } from "./ec2";

describe("waitForPublicIp", () => {
  test("retries when a new instance is not immediately visible", async () => {
    let attempts = 0;

    const ip = await waitForPublicIp(
      async () => {
        attempts += 1;

        if (attempts === 1) {
          const err = new Error(
            "The instance ID 'i-0905a2e9052ec13f6' does not exist",
          ) as Error & { name: string };
          err.name = "InvalidInstanceID.NotFound";
          throw err;
        }

        return { PublicIpAddress: "34.201.10.20" };
      },
      { maxAttempts: 3, delayMs: 0 },
    );

    expect(ip).toBe("34.201.10.20");
    expect(attempts).toBe(2);
  });

  test("throws non-retryable errors immediately", async () => {
    const err = new Error("UnauthorizedOperation") as Error & { name: string };
    err.name = "UnauthorizedOperation";

    await expect(
      waitForPublicIp(
        async () => {
          throw err;
        },
        { maxAttempts: 3, delayMs: 0 },
      ),
    ).rejects.toBe(err);
  });
});
