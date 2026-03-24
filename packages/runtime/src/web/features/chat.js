import { nameColor } from "../lib/colors.js";
import { $, escapeHtml } from "../lib/dom.js";
import { formatSessionTime, renderMentions } from "../lib/format.js";

const KEY_MAP = {
  Enter: "\r",
  Esc: "\x1b",
  Tab: "\t",
  Space: " ",
  Up: "\x1b[A",
  Down: "\x1b[B",
  Left: "\x1b[D",
  Right: "\x1b[C",
  "Ctrl+C": "\x03",
  "Ctrl+B": "\x02",
  y: "y",
  n: "n",
};

export function createChatController({
  state,
  onSendMessage,
  onSendKey,
  onCreateFreshSession,
  onJoinSession,
  onLayoutChange,
  onMarkMentionsRead,
}) {
  const usersBar = $("users-bar");
  const errorOverlay = $("error-overlay");
  const errorTitle = $("error-title");
  const errorDesc = $("error-desc");
  const errorNewSession = $("error-new-session");
  const chatLog = $("chat-log");
  const bottomPanel = $("bottom-panel");
  const chatBadge = $("chat-badge");
  const chatToggle = $("chat-toggle");
  const mentionsBanner = $("mentions-banner");
  const messageInput = $("msg-input");
  const mentionDropdown = $("mention-dropdown");
  const sendButton = $("send-btn");
  const keyBar = $("key-bar");

  let chatUnread = 0;

  function bumpChatBadge() {
    if (!bottomPanel.classList.contains("collapsed")) return;
    chatUnread += 1;
    chatBadge.textContent = chatUnread > 99 ? "99+" : String(chatUnread);
    chatBadge.style.display = "inline";
  }

  function addChat(name, text) {
    const row = document.createElement("div");
    row.className = "chat-msg";
    row.innerHTML = `<span class="name" style="color:${nameColor(name)}">${escapeHtml(name)}</span>: <span class="text">${renderMentions(text, state.myName)}</span>`;
    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
    bumpChatBadge();
  }

  function addSystem(text) {
    const row = document.createElement("div");
    row.className = "chat-msg system";
    row.textContent = text;
    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
    bumpChatBadge();
  }

  function hideErrorOverlay() {
    errorOverlay.classList.remove("visible");
  }

  function showErrorOverlay(title, description, showNewSession) {
    errorTitle.textContent = title;
    errorDesc.textContent = description;
    errorNewSession.style.display = showNewSession ? "" : "none";
    errorOverlay.classList.add("visible");
  }

  function updateUsers(users) {
    state.connectedUsers = users;
    usersBar.innerHTML = users.map((user) => (
      `<span class="user-dot"></span><span style="color:${nameColor(user)}">${escapeHtml(user)}</span>`
    )).join("&nbsp;&nbsp;");
  }

  function setInputEnabled(enabled) {
    messageInput.disabled = !enabled;
    sendButton.disabled = !enabled;
  }

  function focusInput() {
    messageInput.focus();
  }

  function resetSessionView() {
    hideErrorOverlay();
    chatLog.innerHTML = "";
    mentionsBanner.style.display = "none";
    mentionsBanner.innerHTML = "";
    setInputEnabled(true);
    document.body.classList.remove("in-lobby");
  }

  async function createFreshSessionFromOverlay() {
    hideErrorOverlay();
    try {
      const session = await onCreateFreshSession();
      if (session?.id) onJoinSession(session.id);
    } catch (error) {
      addSystem(`Failed to create new session: ${error.message}`);
    }
  }

  function send({ direct = false } = {}) {
    const text = messageInput.value.trim();
    if (!text || !state.currentSessionId) return;
    onSendMessage(text, direct);
    messageInput.value = "";
    messageInput.focus();
  }

  function showMentionsBanner(mentions) {
    let html = '<div class="banner-title">You were mentioned while away</div>';
    for (const mention of mentions) {
      const preview = mention.text.length > 60 ? `${mention.text.slice(0, 60)}...` : mention.text;
      html += `<div class="banner-msg"><span class="banner-from">${escapeHtml(mention.from)}</span> in <strong>${escapeHtml(mention.sessionName)}</strong>: ${renderMentions(preview, state.myName)} <span style="color:#8b949e;font-size:11px">${escapeHtml(formatSessionTime(new Date(mention.timestamp).toISOString()))}</span></div>`;
    }
    html += '<button class="banner-close" title="Dismiss">&times;</button>';
    mentionsBanner.innerHTML = html;
    mentionsBanner.style.display = "block";

    if (bottomPanel.classList.contains("collapsed")) {
      bottomPanel.classList.remove("collapsed");
      setTimeout(onLayoutChange, 50);
    }

    mentionsBanner.querySelector(".banner-close").addEventListener("click", (event) => {
      event.stopPropagation();
      mentionsBanner.style.display = "none";
      mentionsBanner.innerHTML = "";
      onMarkMentionsRead();
    });
  }

  $("error-dismiss").addEventListener("click", hideErrorOverlay);
  errorNewSession.addEventListener("click", createFreshSessionFromOverlay);
  sendButton.addEventListener("click", () => send());
  keyBar.addEventListener("click", (event) => {
    const button = event.target.closest(".key-btn");
    if (!button) return;
    const sequence = KEY_MAP[button.dataset.label];
    if (sequence) onSendKey(sequence, button.dataset.label);
  });
  chatToggle.addEventListener("click", () => {
    bottomPanel.classList.toggle("collapsed");
    if (!bottomPanel.classList.contains("collapsed")) {
      chatUnread = 0;
      chatBadge.style.display = "none";
      messageInput.focus();
    }
    setTimeout(onLayoutChange, 50);
  });

  messageInput.addEventListener("keydown", (event) => {
    if (
      mentionDropdown.style.display === "block" &&
      ["Enter", "Tab", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)
    ) {
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    if (!messageInput.value.trim()) {
      if (state.currentSessionId) onSendKey("\r", "Enter");
      return;
    }

    const direct = event.shiftKey;
    const wantEsc = !direct && (event.metaKey || event.ctrlKey);
    send({ direct });
    if (wantEsc) onSendKey("\x1b", "Esc");
  });

  messageInput.addEventListener("paste", async (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      event.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;

      const placeholder = messageInput.placeholder;
      messageInput.placeholder = "Uploading image...";
      messageInput.style.borderColor = "#ffa657";

      try {
        const formData = new FormData();
        formData.append("image", blob);
        const response = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (data.path) {
          messageInput.value = `${messageInput.value ? `${messageInput.value} ` : ""}${data.path} `;
          messageInput.focus();
        } else {
          addSystem(`Image upload failed: ${data.error || "unknown error"}`);
        }
      } catch (error) {
        addSystem(`Image upload failed: ${error.message}`);
      } finally {
        messageInput.placeholder = placeholder;
        messageInput.style.borderColor = "";
      }
      break;
    }
  });

  return {
    addChat,
    addSystem,
    focusInput,
    hideErrorOverlay,
    resetSessionView,
    setInputEnabled,
    showErrorOverlay,
    showMentionsBanner,
    updateUsers,
  };
}
