import { useState, useEffect, useCallback, useRef } from 'react';
import './Dashboard.css';

interface Jam {
  id: string;
  instanceId: string;
  url: string | null;
  state: string;
  creator: { login: string; name: string; avatar_url: string };
  created_at: string;
}

interface SessionUser {
  login: string;
  name: string;
  avatar_url: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [jams, setJams] = useState<Jam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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
        body: JSON.stringify({}),
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
      await fetchJams();
    } catch (err: any) {
      setError(err.message || 'Failed to create instance');
    } finally {
      setCreating(false);
    }
  }, [fetchJams]);

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
  const pollRef = useRef<ReturnType<typeof setInterval>>();
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

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-brand">Jam</a>
          <div className="dash-header-right">
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
          {(() => {
            const hasActive = jams.some(
              j => j.creator?.login === user?.login && (j.state === 'pending' || j.state === 'running')
            );
            return (
              <button className="dash-create-btn" onClick={handleCreate} disabled={creating || hasActive}>
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
                    Create Instance
                  </>
                )}
              </button>
            );
          })()}
        </div>

        {error && (
          <div className="dash-error">
            <span>{error}</span>
            <button className="dash-error-dismiss" onClick={() => setError(null)}>&times;</button>
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
              return (
                <div key={jam.id} className={`dash-card${isOwner ? ' dash-card-own' : ''}`}>
                  <div className="dash-card-header">
                    <h3 className="dash-card-name">jam-{jam.id}</h3>
                    <span className={`dash-status dash-status-${jam.state}`}>
                      <span className="dash-status-dot" />
                      {jam.state}
                    </span>
                  </div>
                  <div className="dash-card-url">{jam.url || 'Starting up...'}</div>
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
                        onClick={() => jam.url && window.open(jam.url, '_blank')}
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
