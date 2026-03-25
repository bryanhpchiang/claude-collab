import type { DashboardAccessState } from "../types";

function accessLinkStatus(clink: DashboardAccessState["inviteLinks"][number]) {
  if (clink.revoked_at) return "revoked";
  if (clink.claimed_at) return "claimed";
  return "active";
}

type DashboardAccessModalProps = {
  access: DashboardAccessState;
  deletingId: string | null;
  onClose(): void;
  onCopyInvite(linkId: string): void;
  onCreateInvite(): void;
  onDelete(jamId: string): void;
  onRemoveMember(userId: string): void;
  onRevokeInvite(linkId: string): void;
};

export function DashboardAccessModal({
  access,
  deletingId,
  onClose,
  onCopyInvite,
  onCreateInvite,
  onDelete,
  onRemoveMember,
  onRevokeInvite,
}: DashboardAccessModalProps) {
  if (!access.jamId) return null;

  return (
    <div className="access-modal">
      <div className="access-modal-backdrop" onClick={onClose}></div>
      <div className="access-modal-dialog">
        <div className="access-modal-header">
          <div>
            <p className="section-label">Access</p>
            <h2 className="access-modal-title">{access.jamName || "Manage Access"}</h2>
          </div>
          <div className="dash-card-actions">
            <button className="dash-card-delete" type="button" onClick={() => { onDelete(access.jamId!); onClose(); }}>
              {deletingId === access.jamId ? "Terminating..." : "Terminate"}
            </button>
            <button className="dash-card-delete" type="button" onClick={onClose}>
              Close
            </button>
          </div>
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
            onClick={onCreateInvite}
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
                          onClick={() => onCopyInvite(link.id)}
                        >
                          Copy
                        </button>
                      ) : null}
                      {status === "active" ? (
                        <button
                          className="dash-card-delete"
                          type="button"
                          onClick={() => onRevokeInvite(link.id)}
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
                      onClick={() => onRemoveMember(member.user_id)}
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
  );
}
