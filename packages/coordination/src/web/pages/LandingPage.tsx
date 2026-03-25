import { FormEvent, useState } from "react";

const previewLines = [
  ["liam", "build a landing page for our app", "t-user", "t-highlight"],
  ["sofia", "make it dark theme with gradients", "t-user", "t-highlight"],
  ["claude", "On it. Spawning agents for both tasks...", "t-prompt", "t-green"],
];

type LandingPageProps = {
  authEnabled: boolean;
  signedIn: boolean;
};

export function LandingPage({ authEnabled, signedIn }: LandingPageProps) {
  const [rawJamValue, setRawJamValue] = useState("");

  const primaryHref = signedIn ? "/dashboard" : authEnabled ? "/auth/github" : "#";
  const primaryLabel = signedIn ? "Open Dashboard" : "Start a Jam";
  const primaryClass = authEnabled || signedIn ? "btn-start" : "btn-start is-disabled";

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = rawJamValue.trim();
    if (!raw) return;

    let jamId = raw;
    const match = raw.match(/\/j\/([a-zA-Z0-9_-]+)/);
    if (match?.[1]) {
      jamId = match[1];
    } else {
      const lastSegment = raw.replace(/\/+$/, "").split("/").pop();
      if (lastSegment) jamId = lastSegment;
    }

    window.location.href = `/j/${encodeURIComponent(jamId)}`;
  };

  return (
    <>
      <div className="page-gradient page-gradient-top"></div>
      <div className="page-gradient page-gradient-bottom"></div>
      <div className="page-grid"></div>
      <div className="container">
        <nav className="site-nav">
          <a href="/" className="nav-brand">Jam</a>
          <div className="nav-links">
            <a href="https://github.com/bryanhpchiang/claude-collab" target="_blank" rel="noopener">
              GitHub
            </a>
            {signedIn ? (
              <a className="nav-signin" href="/dashboard">Dashboard</a>
            ) : authEnabled ? (
              <a className="nav-signin" href="/auth/github">Sign in</a>
            ) : (
              <span className="nav-signin nav-signin-disabled">Sign in unavailable</span>
            )}
          </div>
        </nav>

        <main className="hero">
          <div className="hero-badge">
            <span className="dot"></span>
            Multiplayer Claude Code
          </div>
          <h1 className="hero-logo">Jam</h1>
          <p className="hero-tagline">
            Code together with Claude in real time. One link, one room, everyone building at once.
          </p>

          <div className="hero-actions">
            <a className={primaryClass} href={primaryHref}>
              <span className="btn-icon">▶</span>
              {primaryLabel}
            </a>
            {!authEnabled && !signedIn ? (
              <p className="landing-note">GitHub OAuth is not configured on this deployment yet.</p>
            ) : null}
            <div className="divider">or join an existing Jam</div>
            <form className="join-row" onSubmit={handleJoin}>
              <input
                className="join-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a Jam ID or full /j/... link"
                value={rawJamValue}
                onChange={(event) => setRawJamValue(event.target.value)}
              />
              <button className="btn-join" type="submit">Join</button>
            </form>
          </div>

          <section className="terminal-preview">
            <div className="terminal-bar">
              <span className="terminal-dot"></span>
              <span className="terminal-dot"></span>
              <span className="terminal-dot"></span>
              <span className="terminal-bar-title">Jam Session</span>
            </div>
            <div className="terminal-body">
              {previewLines.map(([speaker, text, speakerClass, textClass]) => (
                <div className="terminal-line" key={`${speaker}-${text}`}>
                  <span className={speakerClass}>{speaker}</span>{" "}
                  <span className="t-text">&gt;</span>{" "}
                  <span className={textClass}>{text}</span>
                </div>
              ))}
              <div className="terminal-line">
                <span className="t-green">  ✓ Created landing.html with dark theme</span>
              </div>
              <div className="terminal-line">
                <span className="t-green">  ✓ Added gradient accents and responsive layout</span>
              </div>
            </div>
          </section>
        </main>

        <section className="feature-grid">
          <article className="feature-card">
            <h2>Same room, same context</h2>
            <p>Everyone sees the same terminal and conversation. No syncing, no conflicts.</p>
          </article>
          <article className="feature-card">
            <h2>Clean slate every time</h2>
            <p>Each Jam gets its own environment. Experiment freely without stepping on anyone's work.</p>
          </article>
          <article className="feature-card">
            <h2>Nothing to install</h2>
            <p>Open a link, start coding. Works entirely in the browser.</p>
          </article>
        </section>
      </div>
    </>
  );
}
