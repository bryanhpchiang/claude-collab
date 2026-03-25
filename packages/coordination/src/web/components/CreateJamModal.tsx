type CreateJamModalProps = {
  activeJamExists: boolean;
  createError: string;
  createName: string;
  creating: boolean;
  open: boolean;
  onClose(): void;
  onCreate(): void;
  onCreateNameChange(value: string): void;
};

export function CreateJamModal({
  activeJamExists,
  createError,
  createName,
  creating,
  open,
  onClose,
  onCreate,
  onCreateNameChange,
}: CreateJamModalProps) {
  if (!open) return null;

  return (
    <div className="access-modal">
      <div className="access-modal-backdrop" onClick={creating ? undefined : onClose}></div>
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
            onClick={onClose}
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
            onCreate();
          }}
        >
          <input
            className="dash-name-input"
            type="text"
            maxLength={64}
            autoComplete="off"
            placeholder="Name your jam (optional)"
            value={createName}
            onChange={(event) => onCreateNameChange(event.target.value)}
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
  );
}
