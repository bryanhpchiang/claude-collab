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
            <svg className="dash-brand-logo" viewBox="18 10 64 70" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="30" y="16" width="40" height="8" rx="4" fill="url(#db-jar-lid)"/>
              <rect x="26" y="24" width="48" height="6" rx="3" fill="url(#db-jar-lid)" opacity="0.7"/>
              <path d="M28 30c-2 0-4 2-4 4v36c0 8 6 14 14 14h24c8 0 14-6 14-14V34c0-2-2-4-4-4H28z" fill="url(#db-jar-body)"/>
              <path d="M28 56c0 0 8-6 22-6s22 6 22 6v14c0 8-6 14-14 14H42c-8 0-14-6-14-14V56z" fill="url(#db-jar-fill)" opacity="0.7"/>
              <path d="M34 38v20" stroke="rgba(255,255,255,0.1)" strokeWidth="3" strokeLinecap="round"/>
              <path d="M65 74 C65 71.5 67.5 70 70 70 C72.5 70 75 71.5 75 74 C75 75 74 75.5 70 75.5 C66 75.5 65 75 65 74Z" fill="#6D4BA0"/>
              <path d="M21 75 C21 74 22 73 23.5 73 C25 73 26 74 26 75 C26 75.5 25.5 76 23.5 76 C21.5 76 21 75.5 21 75Z" fill="#A855F7" opacity="0.45"/>
              <path d="M77 75.5 C77 74.8 77.6 74 78.5 74 C79.4 74 80 74.8 80 75.5 C80 76 79.6 76.2 78.5 76.2 C77.4 76.2 77 76 77 75.5Z" fill="#7C3AED" opacity="0.4"/>
              <defs>
                <linearGradient id="db-jar-lid" x1="30" y1="16" x2="70" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#E8A838"/>
                  <stop offset="1" stopColor="#D4872C"/>
                </linearGradient>
                <linearGradient id="db-jar-body" x1="24" y1="30" x2="76" y2="84" gradientUnits="userSpaceOnUse">
                  <stop stopColor="rgba(232,168,56,0.18)"/>
                  <stop offset="1" stopColor="rgba(168,85,247,0.1)"/>
                </linearGradient>
                <linearGradient id="db-jar-fill" x1="28" y1="50" x2="72" y2="84" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#A855F7" stopOpacity="0.4"/>
                  <stop offset="1" stopColor="#7C3AED" stopOpacity="0.2"/>
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
