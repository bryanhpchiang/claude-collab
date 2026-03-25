import { $, escapeHtml } from "../lib/dom.js";
import { markdownToHtml } from "../lib/format.js";

const EMPTY_STATE_HTML = '<div id="state-summary-empty">No activity yet. Start chatting and an AI summary will appear here.</div>';

export function createStateSidebarController({ state }) {
  const sidebar = $("state-sidebar");
  const toggleButton = $("state-toggle-btn");
  const closeButton = $("state-close-btn");
  const summaryContent = $("state-summary-content");
  const lastUpdated = $("state-last-updated");
  const updatingIndicator = $("state-updating-indicator");
  const secretsHeader = $("secrets-header");
  const secretsBody = $("secrets-body");
  const secretType = $("secret-type");
  const secretCustomName = $("secret-custom-name");
  const secretValue = $("secret-value");
  const secretSaveButton = $("secret-save-btn");
  const secretsList = $("secrets-list");

  let lastStateMarkdown = "";
  let pollTimer = null;

  function resetSummary() {
    stopPolling();
    lastStateMarkdown = "";
    summaryContent.innerHTML = EMPTY_STATE_HTML;
    lastUpdated.textContent = "";
    updatingIndicator.classList.remove("visible");
  }

  function renderStateSummary(markdown, updatedAt) {
    updatingIndicator.classList.remove("visible");
    if (!markdown || !markdown.trim()) {
      summaryContent.innerHTML = EMPTY_STATE_HTML;
      lastUpdated.textContent = "";
      return;
    }

    summaryContent.innerHTML = markdownToHtml(markdown);
    const timestamp = updatedAt && updatedAt > 0 ? new Date(updatedAt) : new Date();
    lastUpdated.textContent = `Updated ${timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  async function fetchStateSummary() {
    try {
      const response = await fetch("/api/state-summary");
      const data = await response.json();
      if (data.markdown !== lastStateMarkdown) {
        lastStateMarkdown = data.markdown;
        renderStateSummary(data.markdown, data.lastModified);
      }
    } catch {}
  }

  async function fetchSecrets() {
    try {
      const response = await fetch("/api/secrets");
      const secrets = await response.json();
      secretsList.innerHTML = "";

      for (const secret of secrets) {
        const item = document.createElement("div");
        item.className = "secret-item";
        const deleteButtonClass = secret.createdBy === state.myName ? "secret-del mine" : "secret-del";
        item.innerHTML = `<span class="secret-name">${escapeHtml(secret.name)}</span><span class="secret-mask">••••••••</span><span class="secret-by">${escapeHtml(secret.createdBy)}</span><button class="${deleteButtonClass}">&times;</button>`;
        const deleteButton = item.querySelector("button");
        deleteButton.dataset.name = secret.name;
        deleteButton.addEventListener("click", async (event) => {
          const secretName = event.currentTarget.dataset.name;
          await fetch(`/api/secrets/${encodeURIComponent(secretName)}`, {
            method: "DELETE",
          });
          fetchSecrets();
        });
        secretsList.appendChild(item);
      }
    } catch {}
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(fetchStateSummary, 15000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  toggleButton.addEventListener("click", () => {
    const opening = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open");
    toggleButton.classList.toggle("shifted");
    if (opening) {
      fetchStateSummary();
      fetchSecrets();
    }
  });

  closeButton.addEventListener("click", () => {
    sidebar.classList.remove("open");
    toggleButton.classList.remove("shifted");
  });

  secretsHeader.addEventListener("click", () => {
    secretsBody.classList.toggle("open");
    secretsHeader.querySelector(".chevron").classList.toggle("open");
    if (secretsBody.classList.contains("open")) fetchSecrets();
  });

  secretType.addEventListener("change", () => {
    secretCustomName.style.display = secretType.value === "Custom" ? "block" : "none";
  });

  secretSaveButton.addEventListener("click", async () => {
    const name = secretType.value === "Custom" ? secretCustomName.value.trim() : secretType.value;
    const value = secretValue.value;
    if (!name || !value) return;

    try {
      await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          value,
        }),
      });
      secretValue.value = "";
      secretCustomName.value = "";
      fetchSecrets();
    } catch {}
  });

  resetSummary();

  return {
    fetchSecrets,
    fetchStateSummary,
    resetSummary,
    startPolling,
    stopPolling,
  };
}
