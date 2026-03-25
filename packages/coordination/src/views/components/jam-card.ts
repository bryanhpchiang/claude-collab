import { renderStatusBadge } from "./status-badge";
import { escapeHtml } from "../layout";

const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

export type DashboardJam = {
  id: string;
  instanceId: string;
  url: string | null;
  state: string;
  creator: {
    user_id: string;
    login: string;
    name: string;
    avatar_url: string;
  };
  created_at: string;
  name: string | null;
};

function renderPendingBlock(jam: DashboardJam, isOwner: boolean) {
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

function renderOpenAction(jam: DashboardJam) {
  if (jam.state === "running" && jam.url) {
    return `<a class="dash-card-open" href="${escapeHtml(jam.url)}" target="_blank" rel="noopener">Open</a>`;
  }

  return `<span class="dash-card-open is-disabled">Open</span>`;
}

export function renderJamCard(jam: DashboardJam, currentUserId: string) {
  const isOwner = jam.creator.user_id === currentUserId;
  const jamName = jam.name || `jam-${jam.id}`;
  const body =
    jam.state === "pending"
      ? renderPendingBlock(jam, isOwner)
      : `<div class="dash-card-url">${escapeHtml(jam.url || "Waiting...")}</div>`;

  const avatar = jam.creator.avatar_url
    ? `<img src="${escapeHtml(jam.creator.avatar_url)}" class="dash-card-avatar" alt="">`
    : "";

  const terminateAction = isOwner
    ? `<button class="dash-card-delete" type="button" data-action="delete" data-jam-id="${escapeHtml(jam.id)}">Terminate</button>`
    : "";
  const accessAction = isOwner
    ? `<button class="dash-card-open" type="button" data-action="access" data-jam-id="${escapeHtml(jam.id)}">Manage</button>`
    : "";

  return `<article class="dash-card${isOwner ? " dash-card-own" : ""}" data-jam-id="${escapeHtml(jam.id)}">
    <div class="dash-card-header">
      <h3 class="dash-card-name">${escapeHtml(jamName)}</h3>
      ${renderStatusBadge(jam.state)}
    </div>
    ${body}
    <div class="dash-card-footer">
      <span class="dash-card-creator">
        ${avatar}
        ${escapeHtml(jam.creator.login || "unknown")}
      </span>
      <div class="dash-card-actions">
        ${renderOpenAction(jam)}
        ${accessAction}
        ${terminateAction}
      </div>
    </div>
  </article>`;
}
