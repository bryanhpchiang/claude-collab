const initialState = window.__JAM_DASHBOARD__ || { user: null, jams: [] };
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

if (!initialState.user) {
  window.location.href = "/auth/github";
}

const state = {
  user: initialState.user,
  jams: initialState.jams || [],
  creating: false,
  deletingId: null,
  error: "",
};

const elements = {
  grid: document.getElementById("dash-grid"),
  empty: document.getElementById("dash-empty"),
  error: document.getElementById("dash-error"),
  errorText: document.getElementById("dash-error-text"),
  errorDismiss: document.getElementById("dash-error-dismiss"),
  createButton: document.getElementById("jam-create-btn"),
  nameInput: document.getElementById("jam-name-input"),
};

let pollTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hasActiveJam() {
  return state.jams.some(
    (jam) =>
      jam.creator?.login === state.user?.login &&
      (jam.state === "pending" || jam.state === "running"),
  );
}

function renderStatusBadge(status) {
  return `<span class="dash-status dash-status-${escapeHtml(status)}">
    <span class="dash-status-dot"></span>
    ${escapeHtml(status)}
  </span>`;
}

function renderPendingBlock(jam, isOwner) {
  const createdAt = Date.parse(jam.created_at);
  const isStuck = Number.isFinite(createdAt)
    ? Date.now() - createdAt >= PENDING_TIMEOUT_MS
    : false;

  if (isStuck && isOwner) {
    return `<div class="pending-progress">
      <div class="pending-stuck">
        <div class="pending-stuck-title">Taking longer than expected</div>
        <div class="pending-stuck-desc">This instance may have failed to start. Terminate it and launch a fresh one.</div>
        <button class="pending-restart-btn" type="button" data-action="restart" data-jam-id="${escapeHtml(jam.id)}">Terminate &amp; Start Over</button>
      </div>
    </div>`;
  }

  return `<div class="pending-progress">
    <div class="pending-word">Starting instance</div>
    <div class="pending-copy">
      <div class="pending-title">Bringing the runtime online</div>
      <div class="pending-desc">Waiting for the EC2 instance and runtime health check to pass.</div>
    </div>
  </div>`;
}

function renderJamCard(jam) {
  const isOwner = jam.creator?.login === state.user?.login;
  const jamName = jam.name || `jam-${jam.id}`;
  const body =
    jam.state === "pending"
      ? renderPendingBlock(jam, isOwner)
      : `<div class="dash-card-url">${escapeHtml(jam.url || "Waiting...")}</div>`;
  const avatar = jam.creator?.avatar_url
    ? `<img src="${escapeHtml(jam.creator.avatar_url)}" class="dash-card-avatar" alt="">`
    : "";
  const openAction =
    jam.state === "running" && jam.url
      ? `<a class="dash-card-open" href="${escapeHtml(jam.url)}" target="_blank" rel="noopener">Open</a>`
      : `<span class="dash-card-open is-disabled">Open</span>`;
  const deleteAction = isOwner
    ? `<button class="dash-card-delete" type="button" data-action="delete" data-jam-id="${escapeHtml(jam.id)}">${state.deletingId === jam.id ? "Terminating..." : "Terminate"}</button>`
    : "";

  return `<article class="dash-card${isOwner ? " dash-card-own" : ""}">
    <div class="dash-card-header">
      <h3 class="dash-card-name">${escapeHtml(jamName)}</h3>
      ${renderStatusBadge(jam.state)}
    </div>
    ${body}
    <div class="dash-card-footer">
      <span class="dash-card-creator">
        ${avatar}
        ${escapeHtml(jam.creator?.login || "unknown")}
      </span>
      <div class="dash-card-actions">
        ${openAction}
        ${deleteAction}
      </div>
    </div>
  </article>`;
}

function setError(message) {
  state.error = message || "";
  render();
}

function render() {
  if (elements.error && elements.errorText) {
    elements.error.hidden = !state.error;
    elements.errorText.textContent = state.error;
  }

  if (elements.empty) {
    elements.empty.hidden = state.jams.length > 0;
  }

  if (elements.grid) {
    elements.grid.innerHTML = state.jams.map(renderJamCard).join("");
  }

  const active = hasActiveJam();
  if (elements.createButton) {
    elements.createButton.disabled = state.creating || active;
    elements.createButton.textContent = state.creating
      ? "Creating..."
      : active
        ? "Instance Running"
        : "Create Instance";
  }

  if (elements.nameInput) {
    elements.nameInput.disabled = state.creating || active;
  }

  syncPolling();
}

async function safeJson(response) {
  return response.json().catch(() => ({}));
}

async function loadJams() {
  try {
    const response = await fetch("/api/jams");
    if (!response.ok) {
      throw new Error(`Failed to fetch jams (${response.status})`);
    }
    state.jams = await response.json();
    if (state.error.startsWith("Failed to fetch")) {
      state.error = "";
    }
    render();
  } catch (error) {
    setError(error.message || "Failed to fetch jams");
  }
}

async function createJam(nameOverride) {
  if (hasActiveJam()) return;

  state.creating = true;
  render();

  try {
    const name =
      typeof nameOverride === "string"
        ? nameOverride
        : elements.nameInput?.value.trim();
    const response = await fetch("/api/jams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || undefined }),
    });

    if (response.status === 401) {
      window.location.href = "/auth/github";
      return;
    }

    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.error || `Failed to create instance (${response.status})`);
    }

    if (elements.nameInput) {
      elements.nameInput.value = "";
    }
    state.error = "";
    await loadJams();
  } catch (error) {
    setError(error.message || "Failed to create instance");
  } finally {
    state.creating = false;
    render();
  }
}

async function deleteJam(jamId) {
  state.deletingId = jamId;
  render();

  try {
    const response = await fetch(`/api/jams/${encodeURIComponent(jamId)}`, {
      method: "DELETE",
    });

    if (response.status === 401) {
      window.location.href = "/auth/github";
      return;
    }

    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.error || `Failed to terminate instance (${response.status})`);
    }

    state.error = "";
    await loadJams();
  } catch (error) {
    setError(error.message || "Failed to terminate instance");
  } finally {
    state.deletingId = null;
    render();
  }
}

async function restartJam(jamId) {
  const jam = state.jams.find((entry) => entry.id === jamId);
  await deleteJam(jamId);
  if (jam) {
    await createJam(jam.name || "");
  }
}

function syncPolling() {
  const shouldPoll = state.jams.some((jam) => jam.state === "pending");
  if (shouldPoll && !pollTimer) {
    pollTimer = window.setInterval(loadJams, 3000);
  } else if (!shouldPoll && pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

elements.createButton?.addEventListener("click", () => {
  createJam();
});

elements.nameInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createJam();
  }
});

elements.errorDismiss?.addEventListener("click", () => {
  setError("");
});

elements.grid?.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("button[data-action]");
  if (!button) return;

  const jamId = button.getAttribute("data-jam-id");
  const action = button.getAttribute("data-action");
  if (!jamId || !action) return;

  if (action === "delete") {
    await deleteJam(jamId);
  }

  if (action === "restart") {
    await restartJam(jamId);
  }
});

render();
loadJams();
