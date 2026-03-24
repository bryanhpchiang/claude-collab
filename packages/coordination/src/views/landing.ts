import { renderLayout } from "./layout";

type LandingOptions = {
  signedIn: boolean;
  authEnabled: boolean;
};

const previewLines = [
  `<span class="t-user">liam</span> <span class="t-text">&gt;</span> <span class="t-highlight">build a landing page for our app</span>`,
  `<span class="t-user">sofia</span> <span class="t-text">&gt;</span> <span class="t-highlight">make it dark theme with gradients</span>`,
  `<span class="t-prompt">claude</span> <span class="t-text">&gt;</span> <span class="t-green">On it. Spawning agents for both tasks...</span>`,
  `<span class="t-green">  ✓ Created landing.html with dark theme</span>`,
  `<span class="t-green">  ✓ Added gradient accents and responsive layout</span>`,
];

export function renderLandingPage(options: LandingOptions) {
  const primaryHref = options.signedIn
    ? "/dashboard"
    : options.authEnabled
      ? "/auth/github"
      : "#";
  const primaryLabel = options.signedIn ? "Open Dashboard" : "Start a Jam";
  const primaryClass = options.authEnabled || options.signedIn
    ? "btn-start"
    : "btn-start is-disabled";

  const navAction = options.signedIn
    ? `<a class="nav-signin" href="/dashboard">Dashboard</a>`
    : options.authEnabled
      ? `<a class="nav-signin" href="/auth/github">Sign in</a>`
      : `<span class="nav-signin nav-signin-disabled">Sign in unavailable</span>`;

  const authNotice =
    options.authEnabled || options.signedIn
      ? ""
      : `<p class="landing-note">GitHub OAuth is not configured on this deployment yet.</p>`;

  const preview = previewLines
    .map((line) => `<div class="terminal-line">${line}</div>`)
    .join("");

  const content = `
    <div class="page-gradient page-gradient-top"></div>
    <div class="page-gradient page-gradient-bottom"></div>
    <div class="page-grid"></div>
    <div class="container">
      <nav class="site-nav">
        <a href="/" class="nav-brand">Jam</a>
        <div class="nav-links">
          <a href="https://github.com/bryanhpchiang/claude-collab" target="_blank" rel="noopener">GitHub</a>
          <a href="https://buymeacoffee.com/jam" target="_blank" rel="noopener">Donate</a>
          ${navAction}
        </div>
      </nav>

      <main class="hero">
        <div class="hero-badge">
          <span class="dot"></span>
          Multiplayer Claude Code
        </div>
        <h1 class="hero-logo">Jam</h1>
        <p class="hero-tagline">
          Launch a shared Claude Code session, invite the team, and coordinate through one browser link.
        </p>

        <div class="hero-actions">
          <a class="${primaryClass}" href="${primaryHref}">
            <span class="btn-icon">▶</span>
            ${primaryLabel}
          </a>
          ${authNotice}
          <div class="divider">or join an existing session</div>
          <form class="join-row" id="join-form">
            <input
              id="join-input"
              class="join-input"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="Paste a Jam ID or full /j/... link">
            <button class="btn-join" type="submit">Join</button>
          </form>
        </div>

        <section class="terminal-preview">
          <div class="terminal-bar">
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-dot"></span>
            <span class="terminal-bar-title">Jam Session</span>
          </div>
          <div class="terminal-body">${preview}</div>
        </section>
      </main>

      <section class="feature-grid">
        <article class="feature-card">
          <h2>Real-time collaboration</h2>
          <p>Everyone sees the same terminal, the same output, and the same conversation state.</p>
        </article>
        <article class="feature-card">
          <h2>Disposable runtimes</h2>
          <p>Each Jam launches on its own instance so teams can experiment without colliding with each other.</p>
        </article>
        <article class="feature-card">
          <h2>Browser-first workflow</h2>
          <p>Use the coordination dashboard to launch, monitor, and share a session without installing anything locally.</p>
        </article>
      </section>
    </div>
    <script>
      const joinForm = document.getElementById("join-form");
      const joinInput = document.getElementById("join-input");
      joinForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const raw = joinInput?.value.trim();
        if (!raw) return;
        let jamId = raw;
        const match = raw.match(/\\/j\\/([a-zA-Z0-9_-]+)/);
        if (match) {
          jamId = match[1];
        } else {
          const last = raw.replace(/\\/+$/, "").split("/").pop();
          if (last) jamId = last;
        }
        window.location.href = "/j/" + encodeURIComponent(jamId);
      });
    </script>
  `;

  return renderLayout({
    title: "Jam",
    bodyClass: "page-landing",
    content,
  });
}
