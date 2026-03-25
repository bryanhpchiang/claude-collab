import { useEffect, useState } from "react";
import type { DashboardJam } from "../types";
import { StatusBadge } from "./StatusBadge";

const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
const PENDING_WORD_INTERVAL_MS = 2 * 1000;
const LOADING_WORDS = [
  "Smearing...",
  "Toasting...",
  "Flipping...",
  "Spreading...",
  "Buttering...",
  "Simmering...",
  "Jarring...",
  "Preserving...",
];

type JamCardProps = {
  currentUserId: string;
  jam: DashboardJam;
  onAccess(jamId: string): void;
  onRestart(jamId: string): void;
};

function getPendingWordIndex(createdAtRaw: string) {
  const createdAt = Date.parse(createdAtRaw);
  if (!Number.isFinite(createdAt)) return 0;
  const elapsed = Math.max(0, Date.now() - createdAt);
  return Math.floor(elapsed / PENDING_WORD_INTERVAL_MS) % LOADING_WORDS.length;
}

function PendingProgress({
  createdAtRaw,
  isOwner,
  jamId,
  onRestart,
}: {
  createdAtRaw: string;
  isOwner: boolean;
  jamId: string;
  onRestart(jamId: string): void;
}) {
  const createdAt = Date.parse(createdAtRaw);
  const isStuck = Number.isFinite(createdAt)
    ? Date.now() - createdAt >= PENDING_TIMEOUT_MS
    : false;
  const [pendingWordIndex, setPendingWordIndex] = useState(0);

  useEffect(() => {
    if (isStuck) return;

    const updatePendingWord = () => {
      setPendingWordIndex(getPendingWordIndex(createdAtRaw));
    };

    updatePendingWord();
    const timer = window.setInterval(updatePendingWord, PENDING_WORD_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [createdAtRaw, isStuck]);

  if (isStuck && isOwner) {
    return (
      <div className="pending-stuck">
        <div className="pending-stuck-title">Taking longer than expected</div>
        <div className="pending-stuck-desc">
          This instance may have failed to start. Terminate it and launch a fresh one.
        </div>
        <button
          className="pending-restart-btn"
          type="button"
          onClick={() => onRestart(jamId)}
        >
          Terminate &amp; Start Over
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="pending-word">{LOADING_WORDS[pendingWordIndex]}</div>
      <div className="pending-copy">
        <div className="pending-desc">
          Waiting for the EC2 instance and runtime health check to pass.
        </div>
      </div>
    </>
  );
}

export function JamCard({
  currentUserId,
  jam,
  onAccess,
  onRestart,
}: JamCardProps) {
  const isOwner = jam.creator.user_id === currentUserId;
  const jamName = jam.name || `jam-${jam.id}`;

  return (
    <article className={`dash-card${isOwner ? " dash-card-own" : ""}`} data-jam-id={jam.id}>
      <div className="dash-card-header">
        <h3 className="dash-card-name">{jamName}</h3>
        <StatusBadge status={jam.state} />
      </div>

      {jam.state === "pending" ? (
        <div className="pending-progress">
          <PendingProgress
            createdAtRaw={jam.created_at}
            isOwner={isOwner}
            jamId={jam.id}
            onRestart={onRestart}
          />
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
        </div>
      </div>
    </article>
  );
}
