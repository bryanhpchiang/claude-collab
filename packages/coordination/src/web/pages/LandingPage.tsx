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
          <a href="/" className="nav-brand">
            <svg className="nav-brand-logo" viewBox="10 2 85 78" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="30" y="16" width="40" height="8" rx="4" fill="url(#nv-jar-lid)"/>
              <rect x="26" y="24" width="48" height="6" rx="3" fill="url(#nv-jar-lid)" opacity="0.7"/>
              <path d="M28 30c-2 0-4 2-4 4v36c0 8 6 14 14 14h24c8 0 14-6 14-14V34c0-2-2-4-4-4H28z" fill="url(#nv-jar-body)"/>
              <path d="M28 56c0 0 8-6 22-6s22 6 22 6v14c0 8-6 14-14 14H42c-8 0-14-6-14-14V56z" fill="url(#nv-jar-fill)" opacity="0.7"/>
              <path d="M34 38v20" stroke="rgba(255,255,255,0.1)" strokeWidth="3" strokeLinecap="round"/>
              <path d="M68 74 C68 71 70.5 69 74 69 C77.5 69 80 71 80 74 C80 75 79 75.5 74 75.5 C69 75.5 68 75 68 74Z" fill="#6D4BA0"/>
              <path d="M17 75 C17 73.5 18.5 72 20.5 72 C22.5 72 24 73.5 24 75 C24 75.5 23.3 76 20.5 76 C17.7 76 17 75.5 17 75Z" fill="#A855F7" opacity="0.45"/>
              <path d="M83 75.5 C83 74.5 83.8 73.5 85 73.5 C86.2 73.5 87 74.5 87 75.5 C87 76 86.5 76.2 85 76.2 C83.5 76.2 83 76 83 75.5Z" fill="#7C3AED" opacity="0.4"/>
              <defs>
                <linearGradient id="nv-jar-lid" x1="30" y1="16" x2="70" y2="30" gradientUnits="userSpaceOnUse"><stop stopColor="#E8A838"/><stop offset="1" stopColor="#D4872C"/></linearGradient>
                <linearGradient id="nv-jar-body" x1="24" y1="30" x2="76" y2="84" gradientUnits="userSpaceOnUse"><stop stopColor="rgba(232,168,56,0.18)"/><stop offset="1" stopColor="rgba(168,85,247,0.1)"/></linearGradient>
                <linearGradient id="nv-jar-fill" x1="28" y1="50" x2="72" y2="84" gradientUnits="userSpaceOnUse"><stop stopColor="#A855F7" stopOpacity="0.4"/><stop offset="1" stopColor="#7C3AED" stopOpacity="0.2"/></linearGradient>
              </defs>
            </svg>
            Jam
          </a>
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
            <svg className="hero-jar-icon" viewBox="10 2 85 78" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Jar */}
              <rect x="30" y="8" width="40" height="8" rx="4" fill="url(#lp-jar-lid)"/>
              <rect x="26" y="16" width="48" height="6" rx="3" fill="url(#lp-jar-lid)" opacity="0.7"/>
              <path d="M28 22c-2 0-4 2-4 4v36c0 8 6 14 14 14h24c8 0 14-6 14-14V26c0-2-2-4-4-4H28z" fill="url(#lp-jar-body)"/>
              <path d="M28 48c0 0 8-6 22-6s22 6 22 6v14c0 8-6 14-14 14H42c-8 0-14-6-14-14V48z" fill="url(#lp-jar-fill)" opacity="0.7"/>
              <path d="M34 30v20" stroke="rgba(255,255,255,0.1)" strokeWidth="3" strokeLinecap="round"/>
              {/* Front-right drop — round top, flat bottom */}
              <path d="M68 74 C68 71 70.5 69 74 69 C77.5 69 80 71 80 74 C80 75 79 75.5 74 75.5 C69 75.5 68 75 68 74Z" fill="#6D4BA0"/>
              {/* Left drop */}
              <path d="M17 75 C17 73.5 18.5 72 20.5 72 C22.5 72 24 73.5 24 75 C24 75.5 23.3 76 20.5 76 C17.7 76 17 75.5 17 75Z" fill="#A855F7" opacity="0.45"/>
              {/* Right tiny drop */}
              <path d="M83 75.5 C83 74.5 83.8 73.5 85 73.5 C86.2 73.5 87 74.5 87 75.5 C87 76 86.5 76.2 85 76.2 C83.5 76.2 83 76 83 75.5Z" fill="#7C3AED" opacity="0.4"/>
              <defs>
                <linearGradient id="lp-jar-lid" x1="30" y1="8" x2="70" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#E8A838"/><stop offset="1" stopColor="#D4872C"/>
                </linearGradient>
                <linearGradient id="lp-jar-body" x1="24" y1="22" x2="76" y2="76" gradientUnits="userSpaceOnUse">
                  <stop stopColor="rgba(232,168,56,0.22)"/><stop offset="1" stopColor="rgba(168,85,247,0.12)"/>
                </linearGradient>
                <linearGradient id="lp-jar-fill" x1="28" y1="42" x2="72" y2="76" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#A855F7" stopOpacity="0.5"/><stop offset="1" stopColor="#7C3AED" stopOpacity="0.25"/>
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

        <div className="feature-grid-header">
          <div className="section-label">Why Jam</div>
        </div>
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
