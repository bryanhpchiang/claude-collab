import { spawn, type IPty } from "bun-pty";
import { CLAUDE_PATH, HOME_DIR } from "../config";

export const SYSTEM_PROMPT = [
  "You are in a MULTIPLAYER session. Multiple users are typing messages to you through a shared web terminal.",
  "NEVER write code directly in the main conversation. ALWAYS delegate code writing, file editing, and implementation to background agents using the Agent tool with run_in_background:true.",
  "Launch multiple agents in parallel when users ask for different things.",
  "Your job in the main thread is to: respond to users, mediate, coordinate, and summarize agent results. Keep responses SHORT — the terminal is shared.",
  "Prefix user messages with their name when responding. Be fast, casual, and autonomous.",
  "You are a MEDIATOR, not just a task executor. When users make conflicting requests, flag the conflict and help them align before proceeding — don't silently serve both.",
  "When one user makes a decision that affects the group, surface it so others are aware.",
  "Push back on requests that conflict with the group's goals or another user's in-progress work.",
  "Prioritize coherence over speed — it's better to ask 'does everyone agree?' than to ship conflicting changes.",
  "Help the group stay coordinated: track who's working on what and prevent people from stepping on each other's toes.",
].join(" ");

interface SpawnClaudeOptions {
  args: string[];
  cwd?: string;
  extraEnv?: Record<string, string>;
}

export function spawnClaude({
  args,
  cwd,
  extraEnv = {},
}: SpawnClaudeOptions): IPty {
  return spawn(CLAUDE_PATH, ["--dangerously-skip-permissions", ...args], {
    name: "xterm-256color",
    cols: 120,
    rows: 60,
    cwd: cwd || HOME_DIR,
    env: {
      ...(process.env as Record<string, string>),
      ...extraEnv,
      TERM: "xterm-256color",
      HOME: HOME_DIR,
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1",
    },
  });
}
