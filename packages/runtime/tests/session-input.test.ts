import { describe, expect, test } from "bun:test";
import { buildClaudeInput } from "../src/session-input";

describe("buildClaudeInput", () => {
  test("wraps standard chat messages with the sender name", () => {
    expect(buildClaudeInput({ name: "sofiane", text: "check this" })).toBe(
      "[sofiane]: check this\r",
    );
  });

  test("sends direct messages without the sender prefix or color codes", () => {
    expect(
      buildClaudeInput({ name: "sofiane", text: "run the tests", direct: true }),
    ).toBe("run the tests\r");
  });
});
