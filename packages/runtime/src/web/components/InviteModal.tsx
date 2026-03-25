import { useCallback, useEffect, useState } from "react";

type InviteLink = {
  id: string;
  jam_id: string;
  created_by_user_id: string;
  created_at: string;
  claimed_by_user_id?: string;
  claimed_at?: string;
  revoked_at?: string;
};

type InviteModalProps = {
  open: boolean;
  onDismiss(): void;
};

function linkStatus(link: InviteLink): "active" | "claimed" | "revoked" {
  if (link.revoked_at) return "revoked";
  if (link.claimed_at || link.claimed_by_user_id) return "claimed";
  return "active";
}

const STATUS_COLORS: Record<string, string> = {
  active: "#3fb950",
  claimed: "#8b949e",
  revoked: "#f85149",
};

const STATUS_BG: Record<string, string> = {
  active: "rgba(63,185,80,0.12)",
  claimed: "rgba(139,148,158,0.12)",
  revoked: "rgba(248,81,73,0.12)",
};

export function InviteModal({ open, onDismiss }: InviteModalProps) {
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invite-links");
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const data = await res.json();
      setLinks(data.inviteLinks ?? []);
    } catch (e: any) {
      setError(e.message || "Failed to load invite links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchLinks();
  }, [open, fetchLinks]);

  const createLink = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/invite-links", { method: "POST" });
      if (!res.ok) throw new Error(`Failed to create: ${res.status}`);
      const data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url).catch(() => undefined);
        setCopied(data.id);
        setTimeout(() => setCopied(null), 2500);
      }
      await fetchLinks();
    } catch (e: any) {
      setError(e.message || "Failed to create invite link");
    } finally {
      setCreating(false);
    }
  };

  const revokeLink = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/invite-links/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to revoke: ${res.status}`);
      await fetchLinks();
    } catch (e: any) {
      setError(e.message || "Failed to revoke invite link");
    }
  };

  if (!open) return null;

  return (
    <div id="name-modal" style={{ zIndex: 150 }}>
      <div
        className="modal-box oauth-modal-box"
        style={{ maxHeight: "80vh", display: "flex", flexDirection: "column", overflowY: "hidden", minWidth: 480 }}
      >
        <div style={{ marginBottom: 4 }}>
          <h2
            style={{
              background: "linear-gradient(135deg, #ff9a56, #ff6b6b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Invite to Jam
          </h2>
          <p style={{ color: "#8b949e", fontSize: 12, margin: 0 }}>
            Share a one-time invite link with someone to join this jam
          </p>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "rgba(248,81,73,0.1)",
              border: "1px solid rgba(248,81,73,0.3)",
              borderRadius: 6,
              color: "#f85149",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            marginTop: 16,
            marginBottom: 16,
            minHeight: 80,
            maxHeight: 360,
          }}
        >
          {loading ? (
            <div style={{ color: "#484f58", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
              Loading…
            </div>
          ) : links.length === 0 ? (
            <div style={{ color: "#484f58", textAlign: "center", padding: "20px 0", fontSize: 13 }}>
              No invite links yet. Create one below.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {links.map((link) => {
                const status = linkStatus(link);
                return (
                  <div
                    key={link.id}
                    style={{
                      background: "#161b22",
                      border: "1px solid #30363d",
                      borderRadius: 8,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: STATUS_COLORS[status],
                            background: STATUS_BG[status],
                            padding: "2px 8px",
                            borderRadius: 10,
                            textTransform: "capitalize",
                          }}
                        >
                          {status}
                        </span>
                        {copied === link.id && (
                          <span style={{ fontSize: 11, color: "#3fb950" }}>Copied!</span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "#484f58" }}>
                        Created {new Date(link.created_at).toLocaleDateString()}
                        {link.claimed_at ? ` · Claimed ${new Date(link.claimed_at).toLocaleDateString()}` : ""}
                        {link.revoked_at ? ` · Revoked ${new Date(link.revoked_at).toLocaleDateString()}` : ""}
                      </span>
                    </div>
                    {status === "active" && (
                      <button
                        type="button"
                        onClick={() => revokeLink(link.id)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "#f85149",
                          background: "rgba(248,81,73,0.1)",
                          border: "1px solid rgba(248,81,73,0.3)",
                          borderRadius: 6,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="oauth-modal-actions" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            style={{
              background: "transparent",
              border: "1px solid #30363d",
              color: "#8b949e",
              padding: "10px 20px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
            onClick={onDismiss}
          >
            Close
          </button>
          <button
            type="button"
            disabled={creating}
            style={{
              background: creating ? "#21262d" : "linear-gradient(135deg, #ff9a56, #ff6b6b)",
              border: "none",
              color: creating ? "#8b949e" : "#fff",
              padding: "10px 20px",
              borderRadius: 6,
              cursor: creating ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
            onClick={() => { createLink(); }}
          >
            {creating ? "Creating…" : "+ Create invite link"}
          </button>
        </div>
      </div>
    </div>
  );
}
