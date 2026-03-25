import { useEffect, useMemo, useState } from "react";
import { JamCard } from "../components/JamCard";
import type {
  CoordinationUser,
  DashboardInviteLink,
  DashboardJam,
  DashboardMember,
} from "../types";

type DashboardPageProps = {
  initialJams: DashboardJam[];
  user: CoordinationUser;
};

type AccessState = {
  jamId: string;
  jamName: string;
  loading: boolean;
  error: string;
  creatingLink: boolean;
  revokingInviteId: string;
  removingMemberId: string;
  members: DashboardMember[];
  inviteLinks: DashboardInviteLink[];
  generatedUrls: Record<string, string>;
};

function createAccessState(): AccessState {
  return {
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

function hasActiveJam(jams: DashboardJam[], userId: string) {
  return jams.some(
    (jam) =>
      jam.creator.user_id === userId &&
      (jam.state === "pending" || jam.state === "running"),
  );
}

function accessLinkStatus(link: DashboardInviteLink) {
  if (link.revoked_at) return "revoked";
  if (link.claimed_at) return "claimed";
  return "active";
}

async function safeJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function DashboardPage({ initialJams, user }: DashboardPageProps) {
  const [jams, setJams] = useState(initialJams);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createName, setCreateName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessState>(createAccessState);

  const activeJamExists = useMemo(() => hasActiveJam(jams, user.id), [jams, user.id]);

  useEffect(() => {
    const hasPending = jams.some((jam) => jam.state === "pending");
    if (!hasPending) return;
    const timer = window.setInterval(() => {
      loadJams().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [jams]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAccess(createAccessState());
      setCreateModalOpen(false);
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const loadJams = async () => {
    try {
      const response = await fetch("/api/jams");
      if (response.status === 401) {
        window.location.href = "/auth/github";
        return;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch jams (${response.status})`);
      }
      setJams(await response.json());
      setError((current) => (current.startsWith("Failed to fetch") ? "" : current));
    } catch (nextError: any) {
      setError(nextError.message || "Failed to fetch jams");
    }
  };

  const loadAccess = async (jamId: string) => {
    setAccess((current) => ({ ...current, loading: true, error: "" }));

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
      setAccess((current) => ({
        ...current,
        loading: false,
        error: "",
        members: payload.members || [],
        inviteLinks: payload.inviteLinks || [],
      }));
    } catch (nextError: any) {
      setAccess((current) => ({
        ...current,
        loading: false,
        error: nextError.message || "Failed to load access controls",
      }));
    }
  };

  const createJam = async (nameOverride?: string) => {
    if (activeJamExists) return;

    setCreating(true);
    setCreateError("");

    try {
      const response = await fetch("/api/jams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: (nameOverride ?? createName).trim() || undefined }),
      });

      if (response.status === 401) {
        window.location.href = "/auth/github";
        return;
      }

      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to create instance (${response.status})`);
      }

      setCreateName("");
      setCreateModalOpen(false);
      setCreateError("");
      setError("");
      await loadJams();
    } catch (nextError: any) {
      setCreateError(nextError.message || "Failed to create instance");
    } finally {
      setCreating(false);
    }
  };

  const deleteJam = async (jamId: string) => {
    setDeletingId(jamId);

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

      setError("");
      setAccess((current) => (current.jamId === jamId ? createAccessState() : current));
      await loadJams();
    } catch (nextError: any) {
      setError(nextError.message || "Failed to terminate instance");
    } finally {
      setDeletingId(null);
    }
  };

  const restartJam = async (jamId: string) => {
    const jam = jams.find((entry) => entry.id === jamId);
    await deleteJam(jamId);
    if (!jam) return;
    await createJam(jam.name || "");
  };

  const openAccessModal = (jamId: string) => {
    const jam = jams.find((entry) => entry.id === jamId);
    if (!jam) return;

    setAccess({
      ...createAccessState(),
      jamId,
      jamName: jam.name || `jam-${jam.id}`,
      loading: true,
    });
    loadAccess(jamId).catch(() => undefined);
  };

  const createInviteLink = async () => {
    if (!access.jamId) return;
    setAccess((current) => ({ ...current, creatingLink: true }));

    try {
      const response = await fetch(
        `/api/jams/${encodeURIComponent(access.jamId)}/invite-links`,
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
      setAccess((current) => ({
        ...current,
        creatingLink: false,
        inviteLinks: [
          {
            id: payload.id,
            created_at: payload.created_at,
            jam_id: current.jamId,
            created_by_user_id: user.id,
          },
          ...current.inviteLinks,
        ],
        generatedUrls: {
          ...current.generatedUrls,
          [payload.id]: payload.url,
        },
      }));

      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(payload.url).catch(() => undefined);
      }
    } catch (nextError: any) {
      setAccess((current) => ({
        ...current,
        creatingLink: false,
        error: nextError.message || "Failed to create invite link",
      }));
    }
  };

  const revokeInviteLink = async (linkId: string) => {
    if (!access.jamId) return;
    setAccess((current) => ({ ...current, revokingInviteId: linkId }));

    try {
      const response = await fetch(
        `/api/jams/${encodeURIComponent(access.jamId)}/invite-links/${encodeURIComponent(linkId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to revoke invite link (${response.status})`);
      }

      setAccess((current) => ({
        ...current,
        revokingInviteId: "",
        inviteLinks: current.inviteLinks.map((link) =>
          link.id === linkId ? { ...link, revoked_at: new Date().toISOString() } : link,
        ),
      }));
    } catch (nextError: any) {
      setAccess((current) => ({
        ...current,
        revokingInviteId: "",
        error: nextError.message || "Failed to revoke invite link",
      }));
    }
  };

  const removeMember = async (userId: string) => {
    if (!access.jamId) return;
    setAccess((current) => ({ ...current, removingMemberId: userId }));

    try {
      const response = await fetch(
        `/api/jams/${encodeURIComponent(access.jamId)}/members/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await safeJson(response);
        throw new Error(body.error || `Failed to remove member (${response.status})`);
      }

      setAccess((current) => ({
        ...current,
        removingMemberId: "",
        members: current.members.filter((member) => member.user_id !== userId),
      }));
    } catch (nextError: any) {
      setAccess((current) => ({
        ...current,
        removingMemberId: "",
        error: nextError.message || "Failed to remove member",
      }));
    }
  };

  const copyInviteLink = async (linkId: string) => {
    const url = access.generatedUrls[linkId];
    if (!url || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(url).catch(() => undefined);
  };

  return (
    <div className="dashboard-shell">
      <header className="dash-header">
        <div className="container dash-header-inner">
          <a href="/" className="dash-brand">Jam</a>
          <div className="dash-header-right">
            <span className="dash-greeting">Hey, {user.name || user.login}</span>
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
              disabled={creating || activeJamExists}
              onClick={() => {
                if (creating || activeJamExists) return;
                setCreateModalOpen(true);
                setCreateError("");
              }}
            >
              {creating ? "Creating..." : activeJamExists ? "Instance Running" : "Create Instance"}
            </button>
          </div>
        </section>

        {error ? (
          <div className="dash-error">
            <div className="dash-error-content">{error}</div>
            <button className="dash-error-dismiss" type="button" onClick={() => setError("")}>
              &times;
            </button>
          </div>
        ) : null}

        {!jams.length ? (
          <div className="dash-empty">
            <p>No instances yet. Create one to get started.</p>
          </div>
        ) : null}

        <section className="dash-grid">
          {jams.map((jam) => (
            <JamCard
              currentUserId={user.id}
              deletingId={deletingId}
              jam={jam}
              key={jam.id}
              onAccess={openAccessModal}
              onDelete={deleteJam}
              onRestart={restartJam}
            />
          ))}
        </section>
      </main>

      {access.jamId ? (
        <div className="access-modal">
          <div className="access-modal-backdrop" onClick={() => setAccess(createAccessState())}></div>
          <div className="access-modal-dialog">
            <div className="access-modal-header">
              <div>
                <p className="section-label">Access</p>
                <h2 className="access-modal-title">{access.jamName || "Manage Access"}</h2>
              </div>
              <button
                className="dash-card-delete"
                type="button"
                onClick={() => setAccess(createAccessState())}
              >
                Close
              </button>
            </div>

            {access.error ? (
              <div className="dash-error">
                <div className="dash-error-content">{access.error}</div>
              </div>
            ) : null}

            <div className="access-actions">
              <button
                className="dash-create-btn"
                type="button"
                disabled={access.creatingLink || access.loading}
                onClick={() => createInviteLink().catch(() => undefined)}
              >
                {access.creatingLink ? "Creating..." : "Create Invite Link"}
              </button>
            </div>

            <section className="access-section">
              <h3>Invite Links</h3>
              {!access.loading && !access.inviteLinks.length ? (
                <div className="access-empty">No invite links yet.</div>
              ) : null}
              <div className="access-list">
                {access.loading ? (
                  <div className="access-empty">Loading access controls...</div>
                ) : (
                  access.inviteLinks.map((link) => {
                    const status = accessLinkStatus(link);
                    const rawUrl = access.generatedUrls[link.id] || "";
                    return (
                      <div className="access-item" key={link.id}>
                        <div className="access-item-main">
                          <div className="access-item-title">
                            Invite link
                            <span className={`access-pill access-pill-${status}`}>{status}</span>
                          </div>
                          <div className={`access-link-url${rawUrl ? "" : " is-muted"}`}>
                            {rawUrl || "Raw invite URL is only shown when it is created."}
                          </div>
                        </div>
                        <div className="dash-card-actions">
                          {rawUrl ? (
                            <button
                              className="dash-card-open"
                              type="button"
                              onClick={() => copyInviteLink(link.id).catch(() => undefined)}
                            >
                              Copy
                            </button>
                          ) : null}
                          {status === "active" ? (
                            <button
                              className="dash-card-delete"
                              type="button"
                              onClick={() => revokeInviteLink(link.id).catch(() => undefined)}
                            >
                              {access.revokingInviteId === link.id ? "Revoking..." : "Revoke"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="access-section">
              <h3>Members</h3>
              <div className="access-list">
                {access.members.map((member) => (
                  <div className="access-item" key={member.user_id}>
                    <div className="access-item-main">
                      <div className="access-item-title">
                        {member.login}
                        <span className={`access-pill access-pill-${member.role}`}>{member.role}</span>
                      </div>
                      <div className="access-item-subtitle">
                        {member.name || member.email || member.user_id}
                      </div>
                    </div>
                    <div className="dash-card-actions">
                      {member.role !== "creator" ? (
                        <button
                          className="dash-card-delete"
                          type="button"
                          onClick={() => removeMember(member.user_id).catch(() => undefined)}
                        >
                          {access.removingMemberId === member.user_id ? "Removing..." : "Remove"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {createModalOpen ? (
        <div className="access-modal">
          <div
            className="access-modal-backdrop"
            onClick={() => {
              if (creating) return;
              setCreateModalOpen(false);
              setCreateError("");
            }}
          ></div>
          <div className="access-modal-dialog create-modal-dialog">
            <div className="access-modal-header">
              <div>
                <p className="section-label">New Instance</p>
                <h2 className="access-modal-title">Create a Jam</h2>
              </div>
              <button
                className="dash-card-open"
                type="button"
                disabled={creating}
                onClick={() => {
                  if (creating) return;
                  setCreateModalOpen(false);
                  setCreateError("");
                }}
              >
                Cancel
              </button>
            </div>

            <p className="create-modal-copy">
              Launch a shared Claude Code session with an optional name for your team.
            </p>

            {createError ? (
              <div className="dash-error">
                <div className="dash-error-content">{createError}</div>
              </div>
            ) : null}

            <form
              className="create-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                createJam().catch(() => undefined);
              }}
            >
              <input
                className="dash-name-input"
                type="text"
                maxLength={64}
                autoComplete="off"
                placeholder="Name your jam (optional)"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
              <div className="create-modal-actions">
                <button
                  className="dash-create-btn"
                  type="submit"
                  disabled={creating || activeJamExists}
                >
                  {creating ? "Creating..." : activeJamExists ? "Instance Running" : "Create Instance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
