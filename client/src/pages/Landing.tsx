import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

const terminalLines = [
  { html: '<span class="t-user">liam</span> <span class="t-text">&gt;</span> <span class="t-highlight">build a landing page for our app</span>' },
  { html: '<span class="t-user">sofia</span> <span class="t-text">&gt;</span> <span class="t-highlight">make it dark theme with gradients</span>' },
  { html: '<span class="t-prompt">claude</span> <span class="t-text">&gt;</span> <span class="t-green">On it! Spawning agents for both tasks...</span>' },
  { html: '<span class="t-text">  </span><span class="t-green">&#10003; Created landing.html with dark theme</span>' },
  { html: '<span class="t-text">  </span><span class="t-green">&#10003; Added gradient accents and responsive layout</span>' },
  { html: '<span class="t-user">liam</span> <span class="t-text">&gt;</span> <span class="t-highlight">looks perfect, ship it</span> <span class="t-cursor"></span>' },
];

export default function Landing() {
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const [joinInput, setJoinInput] = useState('');
  const animatedRef = useRef(false);

  useEffect(() => {
    if (animatedRef.current || !termRef.current) return;
    animatedRef.current = true;
    const el = termRef.current;
    let idx = 0;

    function typeLine() {
      if (idx >= terminalLines.length || !el) return;
      const div = document.createElement('div');
      div.style.opacity = '0';
      div.style.transform = 'translateY(4px)';
      div.style.transition = 'opacity 0.3s, transform 0.3s';
      div.innerHTML = terminalLines[idx].html;
      el.appendChild(div);
      requestAnimationFrame(() => {
        div.style.opacity = '1';
        div.style.transform = 'translateY(0)';
      });
      idx++;
      if (idx < terminalLines.length) {
        setTimeout(typeLine, 800 + Math.random() * 400);
      }
    }

    setTimeout(typeLine, 600);
  }, []);

  const handleJoin = () => {
    const input = joinInput.trim();
    if (!input) return;
    let jamId = input;
    const urlMatch = input.match(/\/j\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) {
      jamId = urlMatch[1];
    } else {
      const lastSegment = input.split('/').pop();
      if (lastSegment) jamId = lastSegment;
    }
    window.location.href = '/j/' + encodeURIComponent(jamId);
  };

  return (
    <>
      <div className="bg-glow" />
      <div className="bg-glow-bottom" />
      <div className="bg-grid" />

      <div className="container">
        <nav>
          <a href="/" className="nav-brand">Jam</a>
          <div className="nav-links">
            <a href="https://github.com/bryanhpchiang/claude-collab" target="_blank" rel="noopener">GitHub</a>
            <button className="nav-signin" onClick={() => navigate('/dashboard')}>Sign in</button>
          </div>
        </nav>

        <section className="hero">
          <div className="hero-badge">
            <span className="dot" />
            Multiplayer Claude Code
          </div>

          <h1 className="hero-logo">Jam</h1>

          <p className="hero-tagline">
            Code together with <strong>Claude</strong>. One shared terminal, your whole team, real-time.
          </p>

          <div className="hero-actions">
            <button className="btn-start" onClick={() => navigate('/dashboard')}>
              <span className="icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </span>
              Start a Jam
            </button>

            <div className="divider">or join an existing session</div>

            <div className="join-row">
              <input
                type="text"
                className="join-input"
                placeholder="Paste a Jam ID or link..."
                autoComplete="off"
                spellCheck={false}
                value={joinInput}
                onChange={e => setJoinInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
              />
              <button className="btn-join" onClick={handleJoin} disabled={!joinInput.trim()}>Join</button>
            </div>
          </div>

          <div style={{ height: 80 }} />

          <div className="terminal-preview">
            <div className="terminal-bar">
              <div className="terminal-dot" />
              <div className="terminal-dot" />
              <div className="terminal-dot" />
              <div className="terminal-bar-title">Jam Session</div>
              <div style={{ width: 30 }} />
            </div>
            <div className="terminal-body" ref={termRef} />
          </div>
        </section>

        <section className="features">
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff9a56" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h3>Real-time collaboration</h3>
              <p>Everyone sees the same terminal. Send messages, share context, and code together with Claude in real time.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff9a56" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              </div>
              <h3>Shared Claude terminal</h3>
              <p>A full Claude Code session that everyone can interact with. No setup, no extensions, no local install needed.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff9a56" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <h3>Works from any browser</h3>
              <p>Share a link and start coding. Works on desktop, tablet, or phone. No downloads, no accounts.</p>
            </div>
          </div>
        </section>
      </div>

      <footer>
        <div className="footer-inner">
          <span className="footer-brand">letsjam.now</span>
          <span className="footer-sep">|</span>
          <a href="https://github.com/bryanhpchiang/claude-collab" target="_blank" rel="noopener">GitHub</a>
          <span className="footer-sep">|</span>
          <span>Built with Claude</span>
        </div>
      </footer>
    </>
  );
}
