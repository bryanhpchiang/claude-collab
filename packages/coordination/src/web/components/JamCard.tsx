import type { DashboardJam } from "../types";
import { StatusBadge } from "./StatusBadge";

const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

type JamCardProps = {
  currentUserId: string;
  deletingId: string | null;
  jam: DashboardJam;
  onAccess(jamId: string): void;
  onDelete(jamId: string): void;
  onRestart(jamId: string): void;
};

export function JamCard({
  currentUserId,
  deletingId,
  jam,
  onAccess,
  onDelete,
  onRestart,
}: JamCardProps) {
  const isOwner = jam.creator.user_id === currentUserId;
  const jamName = jam.name || `jam-${jam.id}`;
  const createdAt = Date.parse(jam.created_at);
  const isStuck = Number.isFinite(createdAt)
    ? Date.now() - createdAt >= PENDING_TIMEOUT_MS
    : false;

  return (
    <article className={`dash-card${isOwner ? " dash-card-own" : ""}`} data-jam-id={jam.id}>
      <div className="dash-card-header">
        <h3 className="dash-card-name">{jamName}</h3>
        <StatusBadge status={jam.state} />
      </div>

      {jam.state === "pending" ? (
        <div className="pending-progress">
          {isStuck && isOwner ? (
            <div className="pending-stuck">
              <div className="pending-stuck-title">Taking longer than expected</div>
              <div className="pending-stuck-desc">
                This instance may have failed to start. Terminate it and launch a fresh one.
              </div>
              <button
                className="pending-restart-btn"
                type="button"
                onClick={() => onRestart(jam.id)}
              >
                Terminate &amp; Start Over
              </button>
            </div>
          ) : (
            <>
              <div className="pending-word">Starting instance</div>
              <div className="pending-copy">
                <div className="pending-title">Bringing the runtime online</div>
                <div className="pending-desc">
                  Waiting for the EC2 instance and runtime health check to pass.
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="dash-card-url">{jam.url || "Waiting..."}</div>
      )}

      <div className="dash-card-footer">
        <span className="dash-card-creator">
          {jam.creator.avatar_url ? (
            <img src={jam.creator.avatar_url} className="dash-card-avatar" alt="" />
          ) : null}
          {jam.creator.login || "unknown"}
        </span>
        <div className="dash-card-actions">
          {jam.state === "running" && jam.url ? (
            <a className="dash-card-open" href={jam.url} target="_blank" rel="noopener">
              Open
            </a>
          ) : (
            <span className="dash-card-open is-disabled">Open</span>
          )}
          {isOwner ? (
            <button className="dash-card-open" type="button" onClick={() => onAccess(jam.id)}>
              Manage
            </button>
          ) : null}
          {isOwner ? (
            <button className="dash-card-delete" type="button" onClick={() => onDelete(jam.id)}>
              {deletingId === jam.id ? "Terminating..." : "Terminate"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
