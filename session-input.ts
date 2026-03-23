interface BuildClaudeInputOptions {
  name: string;
  text: string;
  direct?: boolean;
}

export function buildClaudeInput({
  name,
  text,
  direct = false,
}: BuildClaudeInputOptions): string {
  return `${direct ? text : `[${name}]: ${text}`}\r`;
}
