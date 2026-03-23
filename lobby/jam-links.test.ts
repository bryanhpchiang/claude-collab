import { describe, expect, test } from "bun:test";
import { buildJamRedirectUrl, buildLobbyJamPath } from "./jam-links";

describe("jam links", () => {
  test("builds stable lobby paths for running jams", () => {
    expect(buildLobbyJamPath("abc123")).toBe("/j/abc123");
  });

  test("redirects lobby jam paths to the instance root while preserving query params", () => {
    expect(
      buildJamRedirectUrl("34.201.10.20", "https://letsjam.now/j/abc123?s=General"),
    ).toBe("http://34.201.10.20:7681/?s=General");
  });
});
