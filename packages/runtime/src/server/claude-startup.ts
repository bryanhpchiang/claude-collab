const ANSI_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const MAX_STARTUP_BUFFER = 24_000;
const STARTUP_INPUT_DELAY_MS = 75;

export type ClaudeStartupActionId =
  | "trust-workspace"
  | "accept-bypass-permissions"
  | "confirm-theme"
  | "confirm-subscription-login"
  | "confirm-login-success";

export type ClaudeStartupAction = {
  id: ClaudeStartupActionId;
  writes: string[];
};

export function stripAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

export function normalizeClaudeStartupText(text: string) {
  return stripAnsi(text)
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function isClaudeReadyText(text: string) {
  const plain = normalizeClaudeStartupText(text);
  const hasPrompt = /(^|\n)\s*❯/.test(plain);
  const hasStatusLine = plain.includes("/effort") || plain.includes("? for shortcuts");
  return hasPrompt && hasStatusLine;
}

function includesAll(text: string, parts: string[]) {
  return parts.every((part) => text.includes(part));
}

export function detectClaudeStartupAction(
  text: string,
  handledActions: ReadonlySet<ClaudeStartupActionId> = new Set(),
): ClaudeStartupAction | null {
  const plain = normalizeClaudeStartupText(text);

  if (isClaudeReadyText(plain)) return null;

  if (
    !handledActions.has("trust-workspace") &&
    includesAll(plain, ["Quick safety check:", "Yes, I trust this folder", "No, exit"])
  ) {
    return { id: "trust-workspace", writes: ["\r"] };
  }

  if (
    !handledActions.has("accept-bypass-permissions") &&
    includesAll(plain, [
      "WARNING: Claude Code running in Bypass Permissions mode",
      "1. No, exit",
      "2. Yes, I accept",
    ])
  ) {
    return { id: "accept-bypass-permissions", writes: ["\u001b[B", "\r"] };
  }

  if (
    !handledActions.has("confirm-theme") &&
    plain.includes("Choose the text style that looks best with your terminal")
  ) {
    return { id: "confirm-theme", writes: ["\r"] };
  }

  if (
    !handledActions.has("confirm-subscription-login") &&
    includesAll(plain, ["Select login method:", "Claude account with subscription"])
  ) {
    return { id: "confirm-subscription-login", writes: ["\r"] };
  }

  if (
    !handledActions.has("confirm-login-success") &&
    /Login successful\.\s*Press Enter to continue/i.test(plain)
  ) {
    return { id: "confirm-login-success", writes: ["\r"] };
  }

  return null;
}

export function appendClaudeStartupBuffer(current: string, chunk: string) {
  const next = `${current}${chunk}`;
  return next.length > MAX_STARTUP_BUFFER
    ? next.slice(-MAX_STARTUP_BUFFER)
    : next;
}

export function createClaudeStartupAutomator(shell: { write(data: string): void }) {
  const handledActions = new Set<ClaudeStartupActionId>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let startupBuffer = "";
  let stopped = false;

  const clearTimers = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };

  const queueWrite = (data: string, delayMs: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (stopped) return;
      try {
        shell.write(data);
      } catch {}
    }, delayMs);
    timers.add(timer);
  };

  return {
    observe(chunk: string) {
      if (stopped) return;
      startupBuffer = appendClaudeStartupBuffer(startupBuffer, chunk);
      if (isClaudeReadyText(startupBuffer)) {
        stopped = true;
        clearTimers();
        return;
      }

      const action = detectClaudeStartupAction(startupBuffer, handledActions);
      if (!action) return;
      handledActions.add(action.id);
      action.writes.forEach((write, index) => {
        queueWrite(write, index * STARTUP_INPUT_DELAY_MS);
      });
    },

    stop() {
      stopped = true;
      clearTimers();
    },
  };
}
