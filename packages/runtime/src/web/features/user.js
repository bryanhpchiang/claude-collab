import { nameColor } from "../lib/colors.js";
import { $ } from "../lib/dom.js";

export function initUserController({ state, onConnect, onRenameInSession, onSendKey }) {
  const nameInput = $("name-input");
  const joinButton = $("join-btn");
  const nameModal = $("name-modal");
  const myNameTag = $("my-name-tag");
  const inputArea = $("input-area");

  function joinFlow() {
    const name = nameInput.value.trim();
    if (!name) return;

    state.myName = name;
    localStorage.setItem("jam-username", name);
    nameModal.style.display = "none";
    myNameTag.textContent = name;
    myNameTag.style.display = "block";
    myNameTag.style.color = nameColor(name);

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        state.notificationPermission = permission;
      });
    } else if ("Notification" in window) {
      state.notificationPermission = Notification.permission;
    }

    onConnect();
  }

  inputArea.addEventListener("click", (event) => {
    const tag = event.target.closest("#my-name-tag");
    if (!tag) return;

    const input = document.createElement("input");
    input.id = "name-edit-input";
    input.value = state.myName;
    input.maxLength = 20;
    tag.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      const nextName = input.value.trim() || state.myName;
      state.myName = nextName;
      localStorage.setItem("jam-username", nextName);
      const replacement = document.createElement("div");
      replacement.className = "name-tag";
      replacement.id = "my-name-tag";
      replacement.textContent = nextName;
      replacement.style.display = "block";
      replacement.style.color = nameColor(nextName);
      input.replaceWith(replacement);
      onRenameInSession(nextName);
    };

    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key !== "Enter") return;
      keyEvent.preventDefault();
      save();
    });
    input.addEventListener("blur", save);
  });

  const savedName = localStorage.getItem("jam-username");
  if (savedName) {
    nameInput.value = savedName;
    joinFlow();
  }

  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      joinFlow();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onSendKey(event.key === "ArrowUp" ? "\x1b[A" : "\x1b[B");
    }
  });
  joinButton.addEventListener("click", joinFlow);
}
