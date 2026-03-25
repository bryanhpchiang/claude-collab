import type { SessionUser } from "../services/auth";
import { renderJamCard, type DashboardJam } from "./components/jam-card";
import { renderLayout, escapeHtml, serializeForScript } from "./layout";

type DashboardOptions = {
  user: SessionUser;
  jams: DashboardJam[];
};

export function renderDashboardPage(options: DashboardOptions) {
  const initialState = serializeForScript({
    user: options.user,
    jams: options.jams,
  });

  const cards = options.jams
    .map((jam) => renderJamCard(jam, options.user.id))
    .join("");

  const content = `
    <div class="dashboard-shell">
      <header class="dash-header">
        <div class="container dash-header-inner">
          <a href="/" class="dash-brand">Jam</a>
          <div class="dash-header-right">
            <span class="dash-greeting">Hey, ${escapeHtml(options.user.name || options.user.login)}</span>
            <a href="https://buymeacoffee.com/jam" target="_blank" rel="noopener" class="dash-donate">Donate</a>
            <a href="/auth/logout" class="dash-card-open">Sign out</a>
          </div>
        </div>
      </header>

      <main class="container dash-main">
        <section class="dash-top">
          <div class="dash-title-block">
            <p class="section-label">Coordination</p>
            <h1 class="dash-title">Instances</h1>
            <p class="dash-subtitle">Launch a jam, wait for it to boot, then manage access with one-time invite links.</p>
          </div>
          <div class="dash-create-area">
            <input
              id="jam-name-input"
              class="dash-name-input"
              type="text"
              maxlength="64"
              placeholder="Name your jam (optional)">
            <button id="jam-create-btn" class="dash-create-btn" type="button">Create Instance</button>
          </div>
        </section>

        <div id="dash-error" class="dash-error" hidden>
          <div id="dash-error-text" class="dash-error-content"></div>
          <button id="dash-error-dismiss" class="dash-error-dismiss" type="button">&times;</button>
        </div>

        <div id="dash-empty" class="dash-empty"${options.jams.length ? " hidden" : ""}>
          <p>No instances yet. Create one to get started.</p>
        </div>

        <section id="dash-grid" class="dash-grid">${cards}</section>
      </main>

      <div id="access-modal" class="access-modal" hidden>
        <div class="access-modal-backdrop" data-action="close-access"></div>
        <div class="access-modal-dialog">
          <div class="access-modal-header">
            <div>
              <p class="section-label">Access</p>
              <h2 id="access-modal-title" class="access-modal-title">Manage Access</h2>
            </div>
            <button id="access-modal-close" class="dash-card-delete" type="button">Close</button>
          </div>

          <div id="access-modal-error" class="dash-error" hidden>
            <div id="access-modal-error-text" class="dash-error-content"></div>
          </div>

          <div class="access-actions">
            <button id="access-create-link-btn" class="dash-create-btn" type="button">Create Invite Link</button>
          </div>

          <section class="access-section">
            <h3>Invite Links</h3>
            <div id="access-links-empty" class="access-empty" hidden>No invite links yet.</div>
            <div id="access-links-list" class="access-list"></div>
          </section>

          <section class="access-section">
            <h3>Members</h3>
            <div id="access-members-list" class="access-list"></div>
          </section>
        </div>
      </div>
    </div>
    <script>window.__JAM_DASHBOARD__ = ${initialState};</script>
  `;

  return renderLayout({
    title: "Jam Dashboard",
    bodyClass: "page-dashboard",
    content,
    scripts: ["/static/dashboard.js"],
  });
}
