import { nameColor } from "../lib/colors.js";
import { $, escapeHtml } from "../lib/dom.js";

export function createMentionController({ state }) {
  const mentionDropdown = $("mention-dropdown");
  const messageInput = $("msg-input");

  let activeIndex = -1;
  let filteredUsers = [];

  function getMentionContext() {
    const value = messageInput.value;
    const cursor = messageInput.selectionStart;
    let index = cursor - 1;
    while (index >= 0 && /\w/.test(value[index])) index -= 1;
    if (index >= 0 && value[index] === "@") {
      return {
        start: index,
        query: value.slice(index + 1, cursor).toLowerCase(),
        end: cursor,
      };
    }
    return null;
  }

  function hideMentionDropdown() {
    mentionDropdown.style.display = "none";
    mentionDropdown.innerHTML = "";
    activeIndex = -1;
    filteredUsers = [];
  }

  function updateMentionActive() {
    const options = mentionDropdown.querySelectorAll(".mention-option");
    options.forEach((option, index) => {
      option.classList.toggle("active", index === activeIndex);
    });
    const active = options[activeIndex];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function completeMention(username) {
    const context = getMentionContext();
    if (!context) {
      hideMentionDropdown();
      return;
    }
    const before = messageInput.value.slice(0, context.start);
    const after = messageInput.value.slice(context.end);
    messageInput.value = `${before}@${username} ${after}`;
    const nextPosition = before.length + username.length + 2;
    messageInput.setSelectionRange(nextPosition, nextPosition);
    messageInput.focus();
    hideMentionDropdown();
  }

  function showMentionDropdown(query) {
    filteredUsers = state.connectedUsers.filter((user) => (
      user.toLowerCase() !== state.myName.toLowerCase() &&
      user.toLowerCase().startsWith(query)
    ));
    const remainder = state.connectedUsers.filter((user) => (
      user.toLowerCase() !== state.myName.toLowerCase() &&
      !user.toLowerCase().startsWith(query) &&
      user.toLowerCase().includes(query)
    ));
    filteredUsers = [...filteredUsers, ...remainder];

    if (!filteredUsers.length) {
      hideMentionDropdown();
      return;
    }

    activeIndex = 0;
    mentionDropdown.innerHTML = "";
    for (const [index, user] of filteredUsers.entries()) {
      const option = document.createElement("div");
      option.className = `mention-option${index === 0 ? " active" : ""}`;
      option.innerHTML = `<span class="mention-dot"></span><span style="color:${nameColor(user)}">${escapeHtml(user)}</span>`;
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        completeMention(user);
      });
      mentionDropdown.appendChild(option);
    }
    mentionDropdown.style.display = "block";
  }

  messageInput.addEventListener("input", () => {
    const context = getMentionContext();
    if (!context) {
      hideMentionDropdown();
      return;
    }
    showMentionDropdown(context.query);
  });

  messageInput.addEventListener("keydown", (event) => {
    if (mentionDropdown.style.display !== "block") return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % filteredUsers.length;
      updateMentionActive();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + filteredUsers.length) % filteredUsers.length;
      updateMentionActive();
    } else if (event.key === "Tab" || event.key === "Enter") {
      if (filteredUsers.length > 0 && activeIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        completeMention(filteredUsers[activeIndex]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      hideMentionDropdown();
    }
  });

  messageInput.addEventListener("blur", () => {
    setTimeout(hideMentionDropdown, 150);
  });
}
