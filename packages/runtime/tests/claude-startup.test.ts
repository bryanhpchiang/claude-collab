import { describe, expect, test } from "bun:test";
import {
  detectClaudeStartupAction,
  isClaudeReadyText,
} from "../src/server/claude-startup";

describe("detectClaudeStartupAction", () => {
  test("trusts the workspace safety prompt with Enter", () => {
    const action = detectClaudeStartupAction(`
      Accessing workspace:
      /home/user/jam

      Quick safety check: Is this a project you created or one you trust?

      Claude Code'll be able to read, edit, and execute files here.

      ❯ 1. Yes, I trust this folder
        2. No, exit

      Enter to confirm · Esc to cancel
    `);

    expect(action).toEqual({
      id: "trust-workspace",
      writes: ["\r"],
    });
  });

  test("accepts bypass permissions mode instead of exiting", () => {
    const action = detectClaudeStartupAction(`
      WARNING: Claude Code running in Bypass Permissions mode

      By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.

      ❯ 1. No, exit
        2. Yes, I accept

      Enter to confirm · Esc to cancel
    `);

    expect(action).toEqual({
      id: "accept-bypass-permissions",
      writes: ["\u001b[B", "\r"],
    });
  });

  test("keeps the default Claude subscription login path", () => {
    const action = detectClaudeStartupAction(`
      Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.

      Select login method:

      ❯ 1 Claude account with subscription · Pro, Max, Team, or Enterprise
        2 Anthropic Console account · API usage billing
        3 3rd-party platform · Amazon Bedrock, Microsoft Foundry, or Vertex AI
    `);

    expect(action).toEqual({
      id: "confirm-subscription-login",
      writes: ["\r"],
    });
  });

  test("dismisses the login success continue screen", () => {
    const action = detectClaudeStartupAction(`
      Logged in as someone@example.com
      Login successful. Press Enter to continue...
    `);

    expect(action).toEqual({
      id: "confirm-login-success",
      writes: ["\r"],
    });
  });

  test("stops automating once Claude is ready", () => {
    expect(isClaudeReadyText(`
      ❯
      ⏵⏵ bypass permissions on (shift+tab to cycle)
      ◐ medium · /effort
    `)).toBe(true);

    expect(detectClaudeStartupAction(`
      ❯
      ⏵⏵ bypass permissions on (shift+tab to cycle)
      ◐ medium · /effort
    `)).toBeNull();
  });

  test("does not repeat a prompt that was already handled", () => {
    const action = detectClaudeStartupAction(
      "Choose the text style that looks best with your terminal",
      new Set(["confirm-theme"]),
    );

    expect(action).toBeNull();
  });
});
