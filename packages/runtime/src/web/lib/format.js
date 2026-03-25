function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function stripAnsi(text) {
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

export function isClaudeReadyScreen(text) {
  const plain = stripAnsi(text).replace(/\r/g, "");
  const hasPrompt = /(^|\n)\s*❯/.test(plain);
  const hasStatusLine = plain.includes("/effort") || plain.includes("? for shortcuts");
  return hasPrompt && hasStatusLine;
}

export function formatSessionTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  const diffMin = Math.floor(diffMs / 60000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (diffDays === 0) {
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    return `Today, ${time}`;
  }
  if (diffDays === 1) return `Yesterday, ${time}`;
  if (diffDays < 7) return `${date.toLocaleDateString([], { weekday: "short" })}, ${time}`;
  if (date.getFullYear() === now.getFullYear()) return `${months[date.getMonth()]} ${date.getDate()}, ${time}`;
  return `${months[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}, ${time}`;
}

export function renderMentions(text, currentUser) {
  return escapeHtml(text).replace(/@(\w+)/g, (match, username) => {
    const isCurrentUser = currentUser && username.toLowerCase() === currentUser.toLowerCase();
    return `<span class="mention-highlight${isCurrentUser ? " mention-me" : ""}">${match}</span>`;
  });
}

export function inlineMd(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  let html = "";
  let inList = false;

  for (const line of lines) {
    if (/^##\s+(.+)/.test(line)) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<h2>${escapeHtml(line.replace(/^##\s+/, ""))}</h2>`;
      continue;
    }

    if (/^\s*[-*]\s+(.+)/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inlineMd(line.replace(/^\s*[-*]\s+/, ""))}</li>`;
      continue;
    }

    if (!line.trim()) {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      continue;
    }

    if (inList) {
      html += "</ul>";
      inList = false;
    }
    html += `<p>${inlineMd(line)}</p>`;
  }

  if (inList) html += "</ul>";
  return html;
}
