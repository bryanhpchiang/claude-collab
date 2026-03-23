import { describe, expect, test } from "bun:test";

import {
  DEFAULT_CLERK_PUBLISHABLE_KEY,
  resolveClerkPublishableKey,
} from "../src/config";

describe("resolveClerkPublishableKey", () => {
  test("prefers the build-time VITE key when present", () => {
    expect(
      resolveClerkPublishableKey({
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_from_build",
      }),
    ).toBe("pk_test_from_build");
  });

  test("falls back to the default key when the build-time key is absent", () => {
    expect(resolveClerkPublishableKey({})).toBe(DEFAULT_CLERK_PUBLISHABLE_KEY);
  });
});
