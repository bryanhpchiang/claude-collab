import { describe, expect, test } from "bun:test";
import { buildClaudeInput, getUserColor } from "./session-input";

const ANSI_RESET = "\x1b[0m";

describe("buildClaudeInput", () => {
  test("wraps standard chat messages with the sender name and ANSI color", () => {
    const color = getUserColor("sofiane");
    expect(buildClaudeInput({ name: "sofiane", text: "check this" })).toBe(
      `${color}[sofiane]: check this${ANSI_RESET}\r`,
    );
  });

  test("sends direct messages without the sender prefix or color codes", () => {
    expect(
      buildClaudeInput({ name: "sofiane", text: "run the tests", direct: true }),
    ).toBe("run the tests\r");
  });
});

describe("getUserColor", () => {
  test("returns a non-empty ANSI escape sequence", () => {
    const color = getUserColor("alice");
    expect(color).toMatch(/^\x1b\[\d+m$/);
  });

  test("is deterministic for the same username", () => {
    expect(getUserColor("bob")).toBe(getUserColor("bob"));
  });

  test("different usernames can get different colors", () => {
    const colors = new Set(["alice", "bob", "carol", "dave", "eve"].map(getUserColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
