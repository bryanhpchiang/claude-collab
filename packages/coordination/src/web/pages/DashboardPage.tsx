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
      <header className="dash-header">
        <div className="container dash-header-inner">
          <a href="/" className="dash-brand">Jam</a>
          <div className="dash-header-right">
            <span className="dash-greeting">Hey, {dashboard.user.name || dashboard.user.login}</span>
            <a href="/auth/logout" className="dash-card-open">Sign out</a>
          </div>
        </div>
      </header>

      <main className="container dash-main">
        <section className="dash-top">
          <div className="dash-title-block">
            <h1 className="dash-title">Instances</h1>
            <p className="dash-subtitle">
              Build and deploy together in live multiplayer Claude Code sessions.
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
                ? "Creating..."
                : dashboard.activeJamExists
                  ? "Instance Running"
                  : "Create Instance"}
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
            <p>No instances yet. Create one to get started.</p>
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
