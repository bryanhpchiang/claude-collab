import { escapeHtml } from "../layout";

export function renderStatusBadge(state: string) {
  const safeState = escapeHtml(state);
  return `<span class="dash-status dash-status-${safeState}">
    <span class="dash-status-dot"></span>
    ${safeState}
  </span>`;
}
