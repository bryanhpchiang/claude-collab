import { $ } from "../lib/dom.js";
import { colorizeOutput } from "../lib/colors.js";
import { isClaudeReadyScreen } from "../lib/format.js";

export function createTerminalController({ state, onTtyInput }) {
  const terminalContainer = $("terminal-container");
  const messageInput = $("msg-input");
  const oauthModal = $("oauth-modal");
  const oauthUrlPreview = $("oauth-url-preview");
  const oauthOpenBtn = $("oauth-open-btn");
  const oauthDefaultActions = $("oauth-default-actions");
  const oauthKeyInput = $("oauth-key-input");
  const oauthKeyField = $("oauth-key-field");
  const oauthModalTitle = $("oauth-modal-title");
  const oauthModalDesc = $("oauth-modal-desc");

  const term = new Terminal({
    cursorBlink: true,
    fontSize: window.innerWidth <= 600 ? 10 : 14,
    fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: "#0d1117",
      foreground: "#e6edf3",
      cursor: "#58a6ff",
      selectionBackground: "#264f78",
    },
    disableStdin: true,
    scrollback: window.innerWidth <= 600 ? 2000 : 5000,
  });
  const fitAddon = new FitAddon.FitAddon();

  let userScrolledUp = false;
  let interactiveTerminalMode = false;
  let awaitingClaudeReady = false;
  let oauthUrl = "";
  let oauthSignInOpened = false;

  const isNearBottom = () => term.buffer.active.viewportY >= term.buffer.active.baseY - 5;

  function hideOauthModal() {
    oauthModal.classList.remove("visible");
    oauthUrl = "";
    oauthUrlPreview.textContent = "";
    oauthSignInOpened = false;
    oauthDefaultActions.style.display = "";
    oauthKeyInput.style.display = "none";
    oauthUrlPreview.style.display = "";
    oauthModalTitle.textContent = "Claude Sign In";
    oauthModalDesc.textContent = "Claude Code is asking you to finish OAuth in the browser.";
    oauthKeyField.value = "";
  }

  function showOauthKeyInputView() {
    oauthDefaultActions.style.display = "none";
    oauthUrlPreview.style.display = "none";
    oauthKeyInput.style.display = "block";
    oauthModalTitle.textContent = "Paste Your Code";
    oauthModalDesc.textContent = "Signed in? Paste the code from the browser below.";
    setTimeout(() => oauthKeyField.focus(), 100);
  }

  function showOauthModal(url) {
    oauthUrl = url;
    oauthUrlPreview.textContent = url;
    oauthModal.classList.add("visible");
    if (oauthSignInOpened) showOauthKeyInputView();
  }

  function submitOauthKey() {
    const key = oauthKeyField.value.trim();
    if (!key) return;
    onTtyInput(`${key}\r`);
    hideOauthModal();
  }

  function updateTerminalModeUi() {
    term.options.disableStdin = !interactiveTerminalMode;
    terminalContainer.classList.toggle("interactive", interactiveTerminalMode);
  }

  function setInteractiveMode(next) {
    interactiveTerminalMode = Boolean(next) && Boolean(state.currentSessionId);
    updateTerminalModeUi();
    if (interactiveTerminalMode) term.focus();
  }

  function getCurrentTerminalText() {
    const buffer = term.buffer.active;
    const start = buffer.viewportY;
    const lines = [];
    for (let index = start; index < start + term.rows; index += 1) {
      const line = buffer.getLine(index);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join("\n");
  }

  function extractOauthUrlFromCurrentScreen() {
    const squashed = getCurrentTerminalText().replace(/\s+/g, "");
    if (!squashed.includes("Pastecodehereifprompted>")) return "";
    const prefix = ["https://claude.ai", "/oauth/authorize?"].join("");
    const start = squashed.lastIndexOf(prefix);
    if (start === -1) return "";
    const afterStart = squashed.slice(start);
    const endMarker = afterStart.indexOf("Pastecodehereifprompted>");
    const candidate = endMarker === -1 ? afterStart : afterStart.slice(0, endMarker);
    if (!candidate.includes("client_id=") && !candidate.includes("response_type=")) return "";
    const match = candidate.match(/^https:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/);
    return match ? match[0] : "";
  }

  function maybeShowOauthModal() {
    const foundUrl = extractOauthUrlFromCurrentScreen();
    if (foundUrl) {
      if (foundUrl !== oauthUrl) showOauthModal(foundUrl);
      return;
    }
    if (oauthUrl) hideOauthModal();
  }

  function maybeDisableDirectTypeOnClaudeReady(data) {
    if (!awaitingClaudeReady || !isClaudeReadyScreen(data)) return;
    awaitingClaudeReady = false;
    setInteractiveMode(false);
    hideOauthModal();
    messageInput.focus();
  }

  term.loadAddon(fitAddon);
  term.open(terminalContainer);
  fitAddon.fit();
  updateTerminalModeUi();

  term.element.addEventListener("wheel", () => {
    userScrolledUp = !isNearBottom();
  }, { passive: true });
  term.element.addEventListener("touchmove", () => {
    userScrolledUp = !isNearBottom();
  }, { passive: true });
  term.element.addEventListener("keydown", (event) => {
    if (event.key === "PageUp" || event.key === "ArrowUp") userScrolledUp = true;
  }, { passive: true });
  terminalContainer.addEventListener("click", () => {
    if (interactiveTerminalMode) term.focus();
  });
  term.onData((data) => {
    if (!interactiveTerminalMode || !state.currentSessionId) return;
    onTtyInput(data);
  });

  window.addEventListener("resize", () => {
    const nextFontSize = window.innerWidth <= 600 ? 10 : 14;
    if (term.options.fontSize !== nextFontSize) term.options.fontSize = nextFontSize;
    fitAddon.fit();
  });
  new ResizeObserver(() => fitAddon.fit()).observe(terminalContainer);

  $("oauth-close-btn").addEventListener("click", hideOauthModal);
  oauthOpenBtn.addEventListener("click", () => {
    if (!oauthUrl) return;
    window.open(oauthUrl, "_blank", "noopener,noreferrer");
    oauthSignInOpened = true;
    showOauthKeyInputView();
  });
  $("oauth-key-submit").addEventListener("click", submitOauthKey);
  $("oauth-key-dismiss").addEventListener("click", hideOauthModal);
  oauthKeyField.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitOauthKey();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && oauthSignInOpened && oauthModal.classList.contains("visible")) {
      showOauthKeyInputView();
    }
  });

  return {
    fit() {
      fitAddon.fit();
    },

    resetForSession() {
      awaitingClaudeReady = true;
      hideOauthModal();
      term.clear();
      term.reset();
      setInteractiveMode(true);
    },

    writeOutput(data) {
      const viewport = userScrolledUp ? term.buffer.active.viewportY : -1;
      term.write(colorizeOutput(data, state.connectedUsers, state.myName), () => {
        if (viewport >= 0) term.scrollLines(viewport - term.buffer.active.viewportY);
        else term.scrollToBottom();
        maybeShowOauthModal();
        maybeDisableDirectTypeOnClaudeReady(data);
      });
    },

    handleDisconnect() {
      awaitingClaudeReady = false;
      hideOauthModal();
      setInteractiveMode(false);
    },

    hideOauthModal,
    setInteractiveMode,
  };
}
