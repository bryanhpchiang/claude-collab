import { nameColor } from "../lib/colors.js";
import { $ } from "../lib/dom.js";

export function initUserController({ state }) {
  const myNameTag = $("my-name-tag");

  function setCurrentUser(user) {
    state.currentUser = user || null;
    state.myName = user?.login || "";

    myNameTag.textContent = state.myName;
    myNameTag.style.display = state.myName ? "block" : "none";
    myNameTag.style.color = state.myName ? nameColor(state.myName) : "";

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        state.notificationPermission = permission;
      });
    } else if ("Notification" in window) {
      state.notificationPermission = Notification.permission;
    }
  }

  return {
    setCurrentUser,
  };
}
