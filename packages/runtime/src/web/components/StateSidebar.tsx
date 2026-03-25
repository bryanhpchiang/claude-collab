import type { RuntimeSecret } from "../types";

type StateSidebarProps = {
  lastUpdatedText: string;
  myName: string;
  secretCustomName: string;
  secretType: string;
  secretValue: string;
  secrets: RuntimeSecret[];
  secretsOpen: boolean;
  sidebarOpen: boolean;
  stateSummaryHtml: string;
  updatingSummary: boolean;
  onCloseSidebar(): void;
  onDeleteSecret(name: string): void;
  onSaveSecret(): void;
  onSecretCustomNameChange(value: string): void;
  onSecretTypeChange(value: string): void;
  onSecretValueChange(value: string): void;
  onToggleSecrets(): void;
  onToggleSidebar(): void;
};

export function StateSidebar({
  lastUpdatedText,
  myName,
  secretCustomName,
  secretType,
  secretValue,
  secrets,
  secretsOpen,
  sidebarOpen,
  stateSummaryHtml,
  updatingSummary,
  onCloseSidebar,
  onDeleteSecret,
  onSaveSecret,
  onSecretCustomNameChange,
  onSecretTypeChange,
  onSecretValueChange,
  onToggleSecrets,
  onToggleSidebar,
}: StateSidebarProps) {
  return (
    <>
      <button
        id="state-toggle-btn"
        className={sidebarOpen ? "shifted" : ""}
        type="button"
        onClick={onToggleSidebar}
      >
        STATE
      </button>

      <div id="state-sidebar" className={sidebarOpen ? "open" : ""}>
        <div id="state-sidebar-header">
          <h2>&#9881; State of Things</h2>
          <button id="state-close-btn" type="button" onClick={onCloseSidebar}>
            &times;
          </button>
        </div>
        <div id="secrets-section">
          <div id="secrets-header" onClick={onToggleSecrets}>
            <svg className="lock-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 4v2H3.5A1.5 1.5 0 0 0 2 7.5v5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.5 6H12V4a4 4 0 0 0-8 0zm6 0v2H6V4a2 2 0 1 1 4 0zm-1 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" />
            </svg>
            Secrets
            <span className={`chevron${secretsOpen ? " open" : ""}`}>&#9654;</span>
          </div>
          <div id="secrets-body" className={secretsOpen ? "open" : ""}>
            <div id="secrets-form">
              <select value={secretType} onChange={(event) => onSecretTypeChange(event.target.value)}>
                <option value="GitHub Token">GitHub Token</option>
                <option value="Anthropic API Key">Anthropic API Key</option>
                <option value="Twilio SID">Twilio SID</option>
                <option value="Twilio Auth Token">Twilio Auth Token</option>
                <option value="Twilio Phone Number">Twilio Phone Number</option>
                <option value="Custom">Custom</option>
              </select>
              {secretType === "Custom" ? (
                <input
                  id="secret-custom-name"
                  type="text"
                  placeholder="Secret name..."
                  style={{ display: "block" }}
                  value={secretCustomName}
                  onChange={(event) => onSecretCustomNameChange(event.target.value)}
                />
              ) : null}
              <input
                id="secret-value"
                type="password"
                placeholder="Secret value..."
                value={secretValue}
                onChange={(event) => onSecretValueChange(event.target.value)}
              />
              <button id="secret-save-btn" type="button" onClick={onSaveSecret}>
                Save
              </button>
            </div>
            <div id="secrets-list">
              {secrets.map((secret) => (
                <div className="secret-item" key={secret.name}>
                  <span className="secret-name">{secret.name}</span>
                  <span className="secret-mask">••••••••</span>
                  <span className="secret-by">{secret.createdBy}</span>
                  <button
                    className={`secret-del${secret.createdBy === myName ? " mine" : ""}`}
                    type="button"
                    onClick={() => onDeleteSecret(secret.name)}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div id="state-summary-content" dangerouslySetInnerHTML={{ __html: stateSummaryHtml }}></div>
        <div id="state-summary-footer">
          <span id="state-last-updated">{lastUpdatedText}</span>
          <span id="state-updating-indicator" className={updatingSummary ? "visible" : ""}>
            <span className="dot"></span> Updating...
          </span>
        </div>
      </div>
    </>
  );
}
