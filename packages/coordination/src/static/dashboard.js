const initialState = window.__JAM_DASHBOARD__ || { user: null, jams: [] };
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

if (!initialState.user) {
  window.location.href = "/auth/github";
}

const state = {
  user: initialState.user,
  jams: initialState.jams || [],
  creating: false,
  createModalOpen: false,
  createError: "",
  deletingId: null,
  error: "",
  access: {
    jamId: "",
    jamName: "",
    loading: false,
    error: "",
    creatingLink: false,
    revokingInviteId: "",
    removingMemberId: "",
    members: [],
    inviteLinks: [],
    generatedUrls: {},
  },
};

const elements = {
  grid: document.getElementById("dash-grid"),
  empty: document.getElementById("dash-empty"),
  error: document.getElementById("dash-error"),
  errorText: document.getElementById("dash-error-text"),
  errorDismiss: document.getElementById("dash-error-dismiss"),
  createButton: document.getElementById("jam-create-btn"),
  createModal: document.getElementById("create-modal"),
  createModalClose: document.getElementById("create-modal-close"),
  createModalError: document.getElementById("create-modal-error"),
  createModalErrorText: document.getElementById("create-modal-error-text"),
  createModalForm: document.getElementById("create-modal-form"),
  createSubmitButton: document.getElementById("jam-create-submit"),
  nameInput: document.getElementById("jam-name-input"),
  accessModal: document.getElementById("access-modal"),
  accessModalTitle: document.getElementById("access-modal-title"),
  accessModalClose: document.getElementById("access-modal-close"),
  accessError: document.getElementById("access-modal-error"),
  accessErrorText: document.getElementById("access-modal-error-text"),
  accessCreateLinkButton: document.getElementById("access-create-link-btn"),
  accessLinksList: document.getElementById("access-links-list"),
  accessLinksEmpty: document.getElementById("access-links-empty"),
  accessMembersList: document.getElementById("access-members-list"),
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
      jam.creator?.user_id === state.user?.id &&
      (jam.state === "pending" || jam.state === "running"),
  );
}

function isOwner(jam) {
  return jam.creator?.user_id === state.user?.id;
}

function renderStatusBadge(status) {
  return `<span class="dash-status dash-status-${escapeHtml(status)}">
    <span class="dash-status-dot"></span>
    ${escapeHtml(status)}
  </span>`;
}

function renderPendingBlock(jam, ownJam) {
  const createdAt = Date.parse(jam.created_at);
  const isStuck = Number.isFinite(createdAt)
    ? Date.now() - createdAt >= PENDING_TIMEOUT_MS
    : false;

  if (isStuck && ownJam) {
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
  const ownJam = isOwner(jam);
  const jamName = jam.name || `jam-${jam.id}`;
  const body =
    jam.state === "pending"
      ? renderPendingBlock(jam, ownJam)
      : `<div class="dash-card-url">${escapeHtml(jam.url || "Waiting...")}</div>`;
  const avatar = jam.creator?.avatar_url
    ? `<img src="${escapeHtml(jam.creator.avatar_url)}" class="dash-card-avatar" alt="">`
    : "";
  const openAction =
    jam.state === "running" && jam.url
      ? `<a class="dash-card-open" href="${escapeHtml(jam.url)}" target="_blank" rel="noopener">Open</a>`
      : `<span class="dash-card-open is-disabled">Open</span>`;
  const accessAction = ownJam
    ? `<button class="dash-card-open" type="button" data-action="access" data-jam-id="${escapeHtml(jam.id)}">Manage</button>`
    : "";
  const deleteAction = ownJam
    ? `<button class="dash-card-delete" type="button" data-action="delete" data-jam-id="${escapeHtml(jam.id)}">${state.deletingId === jam.id ? "Terminating..." : "Terminate"}</button>`
    : "";

  return `<article class="dash-card${ownJam ? " dash-card-own" : ""}">
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
        ${accessAction}
        ${deleteAction}
      </div>
    </div>
  </article>`;
}

function accessLinkStatus(link) {
  if (link.revoked_at) return "revoked";
  if (link.claimed_at) return "claimed";
  return "active";
}

function renderAccessLinks() {
  const links = state.access.inviteLinks || [];
  elements.accessLinksEmpty.hidden = links.length > 0;
  elements.accessLinksList.innerHTML = links.map((link) => {
    const status = accessLinkStatus(link);
    const canRevoke = status === "active";
    const rawUrl = state.access.generatedUrls[link.id] || "";
    const meta = rawUrl
      ? `<div class="access-link-url">${escapeHtml(rawUrl)}</div>`
      : `<div class="access-link-url is-muted">Raw invite URL is only shown when it is created.</div>`;
    const action = canRevoke
      ? `<button class="dash-card-delete" type="button" data-action="revoke-link" data-link-id="${escapeHtml(link.id)}">${state.access.revokingInviteId === link.id ? "Revoking..." : "Revoke"}</button>`
      : "";
    const copyAction = rawUrl
      ? `<button class="dash-card-open" type="button" data-action="copy-link" data-link-id="${escapeHtml(link.id)}">Copy</button>`
      : "";

    return `<div class="access-item">
      <div class="access-item-main">
        <div class="access-item-title">
          Invite link
          <span class="access-pill access-pill-${escapeHtml(status)}">${escapeHtml(status)}</span>
        </div>
        ${meta}
      </div>
      <div class="dash-card-actions">
        ${copyAction}
        ${action}
      </div>
    </div>`;
  }).join("");
}

function renderMembers() {
  const members = state.access.members || [];
  elements.accessMembersList.innerHTML = members.map((member) => {
    const removable = member.role !== "creator";
    const action = removable
      ? `<button class="dash-card-delete" type="button" data-action="remove-member" data-user-id="${escapeHtml(member.user_id)}">${state.access.removingMemberId === member.user_id ? "Removing..." : "Remove"}</button>`
      : "";

    return `<div class="access-item">
      <div class="access-item-main">
        <div class="access-item-title">
          ${escapeHtml(member.login)}
          <span class="access-pill access-pill-${escapeHtml(member.role)}">${escapeHtml(member.role)}</span>
        </div>
        <div class="access-item-subtitle">${escapeHtml(member.name || member.email || member.user_id)}</div>
      </div>
      <div class="dash-card-actions">${action}</div>
    </div>`;
  }).join("");
}

function renderAccessModal() {
  const open = Boolean(state.access.jamId);
  elements.accessModal.hidden = !open;
  if (!open) return;

  elements.accessModalTitle.textContent = state.access.jamName || "Manage Access";
  elements.accessError.hidden = !state.access.error;
  elements.accessErrorText.textContent = state.access.error;
  elements.accessCreateLinkButton.disabled = state.access.creatingLink || state.access.loading;
  elements.accessCreateLinkButton.textContent = state.access.creatingLink
    ? "Creating..."
    : "Create Invite Link";

  if (state.access.loading) {
    elements.accessLinksEmpty.hidden = true;
    elements.accessLinksList.innerHTML = '<div class="access-empty">Loading access controls...</div>';
    elements.accessMembersList.innerHTML = "";
    return;
  }

  renderAccessLinks();
  renderMembers();
}

function renderCreateModal() {
  elements.createModal.hidden = !state.createModalOpen;
  if (!state.createModalOpen) return;

  const active = hasActiveJam();
  elements.createModalError.hidden = !state.createError;
  elements.createModalErrorText.textContent = state.createError;

  if (elements.nameInput) {
    elements.nameInput.disabled = state.creating || active;
  }

  if (elements.createModalClose) {
    elements.createModalClose.disabled = state.creating;
  }

  if (elements.createSubmitButton) {
    elements.createSubmitButton.disabled = state.creating || active;
    elements.createSubmitButton.textContent = state.creating
      ? "Creating..."
      : active
        ? "Instance Running"
        : "Create Instance";
  }
}

function setError(message) {
  state.error = message || "";
  render();
}

function setAccessError(message) {
  state.access.error = message || "";
  renderAccessModal();
}

function openCreateModal() {
  if (state.creating || hasActiveJam()) return;
  state.createModalOpen = true;
  state.createError = "";
  render();
  window.requestAnimationFrame(() => {
    elements.nameInput?.focus();
    elements.nameInput?.select();
  });
}

function closeCreateModal() {
  if (state.creating) return;
  state.createModalOpen = false;
  state.createError = "";
  render();
}

function resetAccessState() {
  state.access = {
    jamId: "",
    jamName: "",
    loading: false,
    error: "",
    creatingLink: false,
    revokingInviteId: "",
    removingMemberId: "",
    members: [],
    inviteLinks: [],
    generatedUrls: {},
  };
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

  renderAccessModal();
  renderCreateModal();
  syncPolling();
}

async function safeJson(response) {
  return response.json().catch(() => ({}));
}

async function loadJams() {
  try {
    const response = await fetch("/api/jams");
    if (response.status === 401) {
      window.location.href = "/auth/github";
      return;
    }
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
  state.createError = "";
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
    state.createModalOpen = false;
    state.createError = "";
    state.error = "";
    await loadJams();
  } catch (error) {
    const message = error.message || "Failed to create instance";
    if (state.createModalOpen) {
      state.createError = message;
      renderCreateModal();
    } else {
      setError(message);
    }
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

    if (state.access.jamId === jamId) {
      resetAccessState();
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

async function loadAccess(jamId) {
  state.access.loading = true;
  state.access.error = "";
  renderAccessModal();

  try {
    const response = await fetch(`/api/jams/${encodeURIComponent(jamId)}/members`);
    if (response.status === 401) {
      window.location.href = "/auth/github";
      return;
    }
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.error || `Failed to load access (${response.status})`);
    }

    const payload = await response.json();
    state.access.members = payload.members || [];
    state.access.inviteLinks = payload.inviteLinks || [];
    state.access.error = "";
  } catch (error) {
    state.access.error = error.message || "Failed to load access controls";
  } finally {
    state.access.loading = false;
    renderAccessModal();
  }
}

function openAccessModal(jamId) {
  const jam = state.jams.find((entry) => entry.id === jamId);
  if (!jam) return;

  state.access.jamId = jamId;
  state.access.jamName = jam.name || `jam-${jam.id}`;
  state.access.members = [];
  state.access.inviteLinks = [];
  state.access.generatedUrls = {};
  state.access.error = "";
  renderAccessModal();
  loadAccess(jamId);
}

function closeAccessModal() {
  resetAccessState();
  render();
}

async function createInviteLink() {
  if (!state.access.jamId) return;
  state.access.creatingLink = true;
  renderAccessModal();

  try {
    const response = await fetch(
      `/api/jams/${encodeURIComponent(state.access.jamId)}/invite-links`,
      { method: "POST" },
    );
    if (response.status === 401) {
      window.location.href = "/auth/github";
      return;
    }
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.error || `Failed to create invite link (${response.status})`);
    }

    const payload = await response.json();
    state.access.generatedUrls[payload.id] = payload.url;
    state.access.inviteLinks = [
      {
        id: payload.id,
        created_at: payload.created_at,
        jam_id: state.access.jamId,
        created_by_user_id: state.user.id,
      },
      ...state.access.inviteLinks,
    ];

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payload.url).catch(() => undefined);
    }
  } catch (error) {
    setAccessError(error.message || "Failed to create invite link");
  } finally {
    state.access.creatingLink = false;
    renderAccessModal();
  }
}

async function revokeInviteLink(linkId) {
  if (!state.access.jamId) return;
  state.access.revokingInviteId = linkId;
  renderAccessModal();

  try {
    const response = await fetch(
      `/api/jams/${encodeURIComponent(state.access.jamId)}/invite-links/${encodeURIComponent(linkId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.error || `Failed to revoke invite link (${response.status})`);
    }

    state.access.inviteLinks = state.access.inviteLinks.map((link) =>
      link.id === linkId ? { ...link, revoked_at: new Date().toISOString() } : link,
    );
  } catch (error) {
    setAccessError(error.message || "Failed to revoke invite link");
  } finally {
    state.access.revokingInviteId = "";
    renderAccessModal();
  }
}

async function removeMember(userId) {
  if (!state.access.jamId) return;
  state.access.removingMemberId = userId;
  renderAccessModal();

  try {
    const response = await fetch(
      `/api/jams/${encodeURIComponent(state.access.jamId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body.error || `Failed to remove member (${response.status})`);
    }

    state.access.members = state.access.members.filter((member) => member.user_id !== userId);
  } catch (error) {
    setAccessError(error.message || "Failed to remove member");
  } finally {
    state.access.removingMemberId = "";
    renderAccessModal();
  }
}

async function copyInviteLink(linkId) {
  const url = state.access.generatedUrls[linkId];
  if (!url) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url).catch(() => undefined);
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
  openCreateModal();
});

elements.createModalClose?.addEventListener("click", closeCreateModal);
elements.createModalForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  createJam();
});

elements.errorDismiss?.addEventListener("click", () => {
  setError("");
});

elements.accessModalClose?.addEventListener("click", closeAccessModal);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.access.jamId) closeAccessModal();
  if (state.createModalOpen) closeCreateModal();
});
elements.createModal?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.getAttribute("data-action") === "close-create") {
    closeCreateModal();
  }
});
elements.accessModal?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.getAttribute("data-action") === "close-access") {
    closeAccessModal();
  }
});
elements.accessCreateLinkButton?.addEventListener("click", () => {
  createInviteLink();
});

elements.grid?.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("button[data-action]");
  if (!button) return;

  const jamId = button.getAttribute("data-jam-id");
  const action = button.getAttribute("data-action");
  if (!jamId || !action) return;

  if (action === "delete") await deleteJam(jamId);
  if (action === "restart") await restartJam(jamId);
  if (action === "access") openAccessModal(jamId);
});

elements.accessLinksList?.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("button[data-action]");
  if (!button) return;

  const action = button.getAttribute("data-action");
  const linkId = button.getAttribute("data-link-id");
  if (!action || !linkId) return;

  if (action === "revoke-link") await revokeInviteLink(linkId);
  if (action === "copy-link") await copyInviteLink(linkId);
});

elements.accessMembersList?.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("button[data-action='remove-member']");
  if (!button) return;

  const userId = button.getAttribute("data-user-id");
  if (!userId) return;
  await removeMember(userId);
});

render();
loadJams();
