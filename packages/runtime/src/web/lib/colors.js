const COLORS = [
  "#ff7b72",
  "#d2a8ff",
  "#79c0ff",
  "#7ee787",
  "#E8A838",
  "#f778ba",
  "#a5d6ff",
  "#ffd8b1",
];

export function nameColor(name) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function hexToAnsi(hex) {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `\x1b[1;38;2;${red};${green};${blue}m`;
}

export function colorizeOutput(data, connectedUsers, currentUser) {
  if (!connectedUsers.length) return data;
  const parts = data.split(/(\x1b\[[0-9;]*[a-zA-Z])/);

  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index].startsWith("\x1b[")) continue;

    for (const user of connectedUsers) {
      const ansi = hexToAnsi(nameColor(user));
      const escaped = user.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const bracketPattern = new RegExp(`\\[${escaped}\\]`, "g");
      const mentionPattern = new RegExp(`@${escaped}\\b`, "g");
      const isCurrentUser = currentUser && user.toLowerCase() === currentUser.toLowerCase();
      const mentionAnsi = isCurrentUser ? "\x1b[1;7;38;2;232;168;56m" : ansi;

      parts[index] = parts[index].replace(bracketPattern, `${ansi}[${user}]\x1b[0m`);
      parts[index] = parts[index].replace(mentionPattern, `${mentionAnsi}@${user}\x1b[0m`);
    }
  }

  return parts.join("");
}
