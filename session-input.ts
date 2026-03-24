interface BuildClaudeInputOptions {
  name: string;
  text: string;
  direct?: boolean;
}

// ANSI 16-color palette: cyan, yellow, magenta, blue, green
const USER_COLORS = ["\x1b[36m", "\x1b[33m", "\x1b[35m", "\x1b[34m", "\x1b[32m"];
const ANSI_RESET = "\x1b[0m";

export function getUserColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return USER_COLORS[hash % USER_COLORS.length];
}

export function buildClaudeInput({
  name,
  text,
  direct = false,
}: BuildClaudeInputOptions): string {
  if (direct) return `${text}\r`;
  const color = getUserColor(name);
  return `${color}[${name}]: ${text}${ANSI_RESET}\r`;
}
