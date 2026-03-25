import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { signJamToken } from "../../../coordination/src/services/jam-tokens";
import { handleAuthRoute } from "./routes/auth";
import { SESSION_COOKIE_NAME, buildCoordinationGateUrl, verifyJamToken } from "./runtime-auth";

const originalEnv = {
  JAM_ID: process.env.JAM_ID,
  JAM_SHARED_SECRET: process.env.JAM_SHARED_SECRET,
  COORDINATION_BASE_URL: process.env.COORDINATION_BASE_URL,
};

const user = {
  id: "user_123",
  email: "jam@example.com",
  login: "jam-user",
  name: "Jam User",
  avatar_url: "https://example.com/avatar.png",
};

beforeEach(() => {
  process.env.JAM_ID = "abc123";
  process.env.JAM_SHARED_SECRET = "runtime-secret";
  process.env.COORDINATION_BASE_URL = "https://letsjam.now";
});

afterEach(() => {
  process.env.JAM_ID = originalEnv.JAM_ID;
  process.env.JAM_SHARED_SECRET = originalEnv.JAM_SHARED_SECRET;
  process.env.COORDINATION_BASE_URL = originalEnv.COORDINATION_BASE_URL;
});

describe("runtime auth", () => {
  test("verifies bootstrap tokens signed by coordination", async () => {
    const token = await signJamToken("runtime-secret", {
      kind: "bootstrap",
      jamId: "abc123",
      user,
      redirectPath: "/?s=General",
      exp: Date.now() + 60_000,
    });

    const payload = await verifyJamToken(token);
    expect(payload?.kind).toBe("bootstrap");
    expect(payload?.user.login).toBe("jam-user");
    expect(payload?.redirectPath).toBe("/?s=General");
  });

  test("bootstrap route exchanges a bootstrap token for a secure session cookie", async () => {
    const token = await signJamToken("runtime-secret", {
      kind: "bootstrap",
      jamId: "abc123",
      user,
      redirectPath: "/?s=General",
      exp: Date.now() + 60_000,
    });

    const response = await handleAuthRoute(
      new Request(`https://abc123.jams.letsjam.now/bootstrap?token=${encodeURIComponent(token)}`, {
        headers: {
          "x-forwarded-proto": "https",
        },
      }),
      new URL(`https://abc123.jams.letsjam.now/bootstrap?token=${encodeURIComponent(token)}`),
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("/?s=General");
    expect(response?.headers.get("set-cookie")).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(response?.headers.get("set-cookie")).toContain("Secure");
  });

  test("builds redirects back to coordination using the jam id and current search params", () => {
    const gateUrl = buildCoordinationGateUrl(
      new Request("https://abc123.jams.letsjam.now/?s=General"),
    );

    expect(gateUrl).toBe("https://letsjam.now/j/abc123?s=General");
  });
});
