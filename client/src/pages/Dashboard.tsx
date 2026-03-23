import { useState, useEffect, useCallback, useRef } from 'react';
import './Dashboard.css';

interface Jam {
  id: string;
  instanceId: string;
  url: string | null;
  state: string;
  creator: { login: string; name: string; avatar_url: string };
  created_at: string;
  name: string | null;
}

interface SessionUser {
  login: string;
  name: string;
  avatar_url: string;
}

const LOADING_WORDS = [
  'Smearing...',
  'Toasting...',
  'Flipping...',
  'Spreading...',
  'Buttering...',
  'Simmering...',
  'Jarring...',
  'Preserving...',
];

const PROGRESS_STEPS = [
  { label: 'Provisioning server', delay: 3000 },
  { label: 'Standing by for handshake', delay: 8000 },
  { label: 'Setting security', delay: 12000 },
  { label: 'Installing dependencies', delay: 18000 },
  { label: 'Warming up Claude', delay: 25000 },
  { label: 'Almost there...', delay: Infinity },
];

const PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function PendingProgress({ createdAt, onRestart }: { createdAt: string; onRestart?: () => void }) {
  const [wordIdx, setWordIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [createdAt]);

  useEffect(() => {
    const id = setInterval(() => {
      setWordIdx(i => (i + 1) % LOADING_WORDS.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const isStuck = elapsed >= PENDING_TIMEOUT_MS;

  if (isStuck) {
    return (
      <div className="pending-progress">
        <div className="pending-stuck">
          <div className="pending-stuck-title">Taking longer than expected</div>
          <div className="pending-stuck-desc">
            This instance may have failed to start. You can terminate it and try again.
          </div>
          {onRestart && (
            <button className="pending-restart-btn" onClick={onRestart}>
              Terminate &amp; Start Over
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pending-progress">
      <div className="pending-word">{LOADING_WORDS[wordIdx]}</div>
      <ul className="pending-steps">
        {PROGRESS_STEPS.map((step, i) => {
          const done = elapsed >= step.delay;
          const isCurrent = !done && (i === 0 || elapsed >= PROGRESS_STEPS[i - 1].delay);
          return (
            <li key={i} className={`pending-step${done ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
              {done ? (
                <span className="pending-check">&#10003;</span>
              ) : isCurrent ? (
                <span className="pending-pulse" />
              ) : (
                <span className="pending-bullet" />
              )}
              <span className={done ? 'pending-struck' : ''}>{step.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [jams, setJams] = useState<Jam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);

  const redirectToSignIn = () => {
    window.location.href = '/auth/github';
  };

  const loadUser = useCallback(async () => {
    const res = await fetch('/api/me');
    if (res.status === 401) {
      redirectToSignIn();
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to load session (${res.status})`);
    }
    const data = await res.json();
    setUser(data);
    return data;
  }, []);

  const fetchJams = useCallback(async () => {
    try {
      const res = await fetch('/api/jams');
      if (!res.ok) throw new Error(`Failed to fetch jams (${res.status})`);
      const data = await res.json();
      setJams(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load instances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const currentUser = await loadUser();
        if (currentUser) {
          await fetchJams();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard');
        setLoading(false);
      }
    })();
  }, [fetchJams, loadUser]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/jams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      if (res.status === 401) {
        redirectToSignIn();
        return;
      }
      if (res.status === 409) {
        setError('You already have a running instance');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to create instance (${res.status})`);
      }
      setNewName('');
      setShowNameInput(false);
      await fetchJams();
    } catch (err: any) {
      setError(err.message || 'Failed to create instance');
    } finally {
      setCreating(false);
    }
  }, [fetchJams, newName]);

  const handleDelete = useCallback(async (jamId: string) => {
    setDeleting(jamId);
    setError(null);
    try {
      const res = await fetch(`/api/jams/${jamId}`, { method: 'DELETE' });
      if (res.status === 401) {
        redirectToSignIn();
        return;
      }
      if (res.status === 403) {
        setError('You can only terminate your own instances');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to terminate instance (${res.status})`);
      }
      await fetchJams();
    } catch (err: any) {
      setError(err.message || 'Failed to terminate instance');
    } finally {
      setDeleting(null);
    }
  }, [fetchJams]);

  // Auto-poll while any instance is pending
  const hasPending = jams.some(j => j.state === 'pending');
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => {
    if (hasPending) {
      pollRef.current = setInterval(fetchJams, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [hasPending, fetchJams]);

  if (loading) {
    return (
      <div className="dash-loading">
        <div className="dash-spinner" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const hasActive = jams.some(
    j => j.creator?.login === user?.login && (j.state === 'pending' || j.state === 'running')
  );

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-brand">Jam</a>
          <div className="dash-header-right">
            <a href="https://buymeacoffee.com/jam" target="_blank" rel="noopener" className="dash-donate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>Donate</a>
            <span className="dash-greeting">
              {user.name ? `Hey, ${user.name}` : user.login}
            </span>
            <a href="/auth/logout" className="dash-card-open">Sign out</a>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-top">
          <h2 className="dash-title">Instances</h2>
          <div className="dash-create-area">
            {showNameInput && !hasActive && (
              <input
                className="dash-name-input"
                type="text"
                placeholder="Name your jam (optional)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                maxLength={64}
                autoFocus
              />
            )}
            <button
              className="dash-create-btn"
              onClick={() => {
                if (!showNameInput && !hasActive) {
                  setShowNameInput(true);
                } else {
                  handleCreate();
                }
              }}
              disabled={creating || hasActive}
            >
              {creating ? (
                <>
                  <div className="dash-spinner-sm" />
                  Creating...
                </>
              ) : hasActive ? (
                'Instance Running'
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  {showNameInput ? 'Launch' : 'Create Instance'}
                </>
              )}
            </button>
            {showNameInput && !hasActive && (
              <button className="dash-cancel-btn" onClick={() => { setShowNameInput(false); setNewName(''); }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="dash-error">
            <div className="dash-error-content">
              <span>{error}</span>
              {error.includes('already have a running') && (
                <div className="dash-error-hint">
                  Terminate your existing instance first, then create a new one.
                </div>
              )}
            </div>
            <div className="dash-error-actions">
              {(error.includes('Failed') || error.includes('Internal')) && (
                <button className="dash-error-retry" onClick={() => { setError(null); handleCreate(); }}>
                  Try Again
                </button>
              )}
              <button className="dash-error-dismiss" onClick={() => setError(null)}>&times;</button>
            </div>
          </div>
        )}

        {jams.length === 0 ? (
          <div className="dash-empty">
            <p>No instances yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="dash-grid">
            {jams.map(jam => {
              const isOwner = jam.creator?.login === user?.login;
              const isPending = jam.state === 'pending';
              return (
                <div key={jam.id} className={`dash-card${isOwner ? ' dash-card-own' : ''}`}>
                  <div className="dash-card-header">
                    <h3 className="dash-card-name">{jam.name || `jam-${jam.id}`}</h3>
                    <span className={`dash-status dash-status-${jam.state}`}>
                      <span className="dash-status-dot" />
                      {jam.state}
                    </span>
                  </div>
                  {isPending ? (
                    <PendingProgress createdAt={jam.created_at} onRestart={isOwner ? async () => {
                      await handleDelete(jam.id);
                      await handleCreate();
                    } : undefined} />
                  ) : (
                    <div className="dash-card-url">{jam.url ? `/j/${jam.id}` : 'Waiting...'}</div>
                  )}
                  <div className="dash-card-footer">
                    <span className="dash-card-creator">
                      {jam.creator?.avatar_url && (
                        <img src={jam.creator.avatar_url} className="dash-card-avatar" alt="" />
                      )}
                      {jam.creator?.login || 'unknown'}
                    </span>
                    <div className="dash-card-actions">
                      <button
                        className="dash-card-open"
                        disabled={!jam.url || jam.state !== 'running'}
                        onClick={() => jam.url && window.open(jam.url + '?s=General', '_blank')}
                      >
                        Open
                      </button>
                      {isOwner && (
                        <button
                          className="dash-card-delete"
                          disabled={deleting === jam.id}
                          onClick={() => handleDelete(jam.id)}
                        >
                          {deleting === jam.id ? 'Terminating...' : 'Terminate'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
