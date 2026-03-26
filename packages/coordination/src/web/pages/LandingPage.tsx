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
          <div className="hero-jar">
            <svg className="hero-jar-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M25 18h50c2 0 3 1 3 3v6H22v-6c0-2 1-3 3-3z" fill="url(#lp-jar-lid)"/>
              <path d="M22 27h56v6c0 2-4 4-8 5H30c-4-1-8-3-8-5v-6z" fill="url(#lp-jar-lid)" opacity="0.7"/>
              <path d="M30 38h40c5 0 9 3 10 8l4 26c1 5-3 10-8 10H24c-5 0-9-5-8-10l4-26c1-5 5-8 10-8z" fill="url(#lp-jar-body)"/>
              <path d="M34 48c4 8 12 14 16 18 4-4 12-10 16-18" stroke="rgba(255,255,255,0.12)" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <defs>
                <linearGradient id="lp-jar-lid" x1="25" y1="18" x2="75" y2="33" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#E8A838"/><stop offset="1" stopColor="#D4872C"/>
                </linearGradient>
                <linearGradient id="lp-jar-body" x1="20" y1="38" x2="80" y2="82" gradientUnits="userSpaceOnUse">
                  <stop stopColor="rgba(232,168,56,0.2)"/><stop offset="1" stopColor="rgba(168,85,247,0.08)"/>
                </linearGradient>
              </defs>
            </svg>
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

        <section className="how-it-works">
          <div className="section-label">How it works</div>
          <h2 className="how-it-works-title">Start jamming in seconds</h2>
          <div className="how-it-works-steps">
            <div className="how-it-works-step">
              <span className="how-it-works-number">1</span>
              <h3>Start a Jam</h3>
              <p>One click launches a fresh Claude Code session in the cloud.</p>
            </div>
            <div className="how-it-works-step">
              <span className="how-it-works-number">2</span>
              <h3>Share the link</h3>
              <p>Send the URL to your team. No accounts, no installs needed.</p>
            </div>
            <div className="how-it-works-step">
              <span className="how-it-works-number">3</span>
              <h3>Build together</h3>
              <p>Everyone sees the same terminal. Talk to Claude, ship code, in real time.</p>
            </div>
          </div>
        </section>

        <section className="feature-grid">
          <article className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E8A838" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h2>Same room, same context</h2>
            <p>Everyone sees the same terminal and conversation. No syncing, no conflicts. Just open a link and you're in.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </div>
            <h2>Clean slate every time</h2>
            <p>Each Jam gets its own environment and Claude session. Experiment freely without stepping on anyone's work.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D4872C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <h2>Nothing to install</h2>
            <p>Open a link, start coding. Works entirely in the browser on desktop, tablet, or phone.</p>
          </article>
        </section>
      </div>

      <footer className="site-footer">
        <div className="footer-inner">
          <span className="footer-brand">Jam</span>
          <span className="footer-sep">&middot;</span>
          <a href="https://github.com/bryanhpchiang/claude-collab" target="_blank" rel="noopener">GitHub</a>
          <span className="footer-sep">&middot;</span>
          <span>Built with Claude</span>
        </div>
      </footer>
    </>
  );
}
