export type ErrorOverlayState = {
  description: string;
  showNewSession: boolean;
  title: string;
  visible: boolean;
};

type ErrorOverlayProps = {
  error: ErrorOverlayState;
  onDismiss(): void;
  onStartNewSession(): void;
};

export function ErrorOverlay({ error, onDismiss, onStartNewSession }: ErrorOverlayProps) {
  return (
    <div id="error-overlay" className={error.visible ? "visible" : ""}>
      <div className="error-title">{error.title}</div>
      <div className="error-desc">{error.description}</div>
      <div className="error-actions">
        {error.showNewSession ? (
          <button className="error-btn error-btn-primary" type="button" onClick={onStartNewSession}>
            Start New Session
          </button>
        ) : null}
        <button className="error-btn error-btn-secondary" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
