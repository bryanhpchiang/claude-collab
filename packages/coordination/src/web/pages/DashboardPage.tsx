import { CreateJamModal } from "../components/CreateJamModal";
import { DashboardAccessModal } from "../components/DashboardAccessModal";
import { JamCard } from "../components/JamCard";
import { useDashboardController } from "../hooks/useDashboardController";
import type {
  CoordinationUser,
  DashboardJam,
} from "../types";

type DashboardPageProps = {
  initialJams: DashboardJam[];
  user: CoordinationUser;
};

export function DashboardPage({ initialJams, user }: DashboardPageProps) {
  const dashboard = useDashboardController({ initialJams, user });

  return (
    <div className="dashboard-shell">
      <div className="page-grid"></div>

      <header className="dash-header">
        <div className="container dash-header-inner">
          <a href="/" className="dash-brand">
            <svg className="dash-brand-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M25 18h50c2 0 3 1 3 3v6H22v-6c0-2 1-3 3-3z" fill="url(#jar-lid)"/>
              <path d="M22 27h56v6c0 2-4 4-8 5H30c-4-1-8-3-8-5v-6z" fill="url(#jar-lid)" opacity="0.7"/>
              <path d="M30 38h40c5 0 9 3 10 8l4 26c1 5-3 10-8 10H24c-5 0-9-5-8-10l4-26c1-5 5-8 10-8z" fill="url(#jar-body)"/>
              <path d="M34 48c4 8 12 14 16 18 4-4 12-10 16-18" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <defs>
                <linearGradient id="jar-lid" x1="25" y1="18" x2="75" y2="33" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff9a56"/>
                  <stop offset="1" stopColor="#ff6b6b"/>
                </linearGradient>
                <linearGradient id="jar-body" x1="20" y1="38" x2="80" y2="82" gradientUnits="userSpaceOnUse">
                  <stop stopColor="rgba(255,154,86,0.18)"/>
                  <stop offset="1" stopColor="rgba(255,107,107,0.08)"/>
                </linearGradient>
              </defs>
            </svg>
            Jam
          </a>
          <div className="dash-header-right">
            <span className="dash-greeting">{dashboard.user.name || dashboard.user.login}</span>
            <a href="/auth/logout" className="dash-signout">Sign out</a>
          </div>
        </div>
      </header>

      <main className="container dash-main">
        <section className="dash-top">
          <div className="dash-title-block">
            <p className="section-label">Dashboard</p>
            <h1 className="dash-title">Your Jams</h1>
            <p className="dash-subtitle">
              Shared coding rooms powered by Claude. Invite your team, work together in real time.
            </p>
          </div>
          <div className="dash-create-area">
            <button
              className="dash-create-btn"
              type="button"
              disabled={dashboard.creating || dashboard.activeJamExists}
              onClick={() => {
                if (dashboard.creating || dashboard.activeJamExists) return;
                dashboard.setCreateModalOpen(true);
                dashboard.setCreateError("");
              }}
            >
              {dashboard.creating
                ? "Starting..."
                : dashboard.activeJamExists
                  ? "Jam Active"
                  : "New Jam"}
            </button>
          </div>
        </section>

        {dashboard.error ? (
          <div className="dash-error">
            <div className="dash-error-content">{dashboard.error}</div>
            <button
              className="dash-error-dismiss"
              type="button"
              onClick={() => dashboard.setError("")}
            >
              &times;
            </button>
          </div>
        ) : null}

        {!dashboard.jams.length ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">&#127860;</span>
            <p className="dash-empty-title">No Jams yet</p>
            <p className="dash-empty-desc">Start a Jam to open a shared coding room. Invite people, spin up sessions, and let Claude do the heavy lifting.</p>
          </div>
        ) : null}

        <section className="dash-grid">
          {dashboard.jams.map((jam) => (
            <JamCard
              currentUserId={dashboard.user.id}
              jam={jam}
              key={jam.id}
              onAccess={dashboard.openAccessModal}
              onRestart={dashboard.restartJam}
            />
          ))}
        </section>
      </main>

      <DashboardAccessModal
        access={dashboard.access}
        deletingId={dashboard.deletingId}
        onClose={dashboard.closeAccessModal}
        onCopyInvite={(linkId) => {
          dashboard.copyInviteLink(linkId).catch(() => undefined);
        }}
        onCreateInvite={() => {
          dashboard.createInviteLink().catch(() => undefined);
        }}
        onDelete={dashboard.deleteJam}
        onRemoveMember={(userId) => {
          dashboard.removeMember(userId).catch(() => undefined);
        }}
        onRevokeInvite={(linkId) => {
          dashboard.revokeInviteLink(linkId).catch(() => undefined);
        }}
      />

      <CreateJamModal
        activeJamExists={dashboard.activeJamExists}
        createError={dashboard.createError}
        createName={dashboard.createName}
        creating={dashboard.creating}
        open={dashboard.createModalOpen}
        onClose={dashboard.closeCreateModal}
        onCreate={() => {
          dashboard.createJam().catch(() => undefined);
        }}
        onCreateNameChange={dashboard.setCreateName}
      />
    </div>
  );
}
