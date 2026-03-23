import { useUser, UserButton, RedirectToSignIn } from '@clerk/clerk-react';
import './Dashboard.css';

const mockInstances = [
  { id: '1', name: 'Frontend Refactor', url: 'https://jam-abc123.fly.dev', status: 'running' as const, users: 3 },
  { id: '2', name: 'API Integration', url: 'https://jam-def456.fly.dev', status: 'running' as const, users: 1 },
  { id: '3', name: 'Bug Bash Session', url: 'https://jam-ghi789.fly.dev', status: 'stopped' as const, users: 0 },
];

export default function Dashboard() {
  const { isSignedIn, isLoaded, user } = useUser();

  if (!isLoaded) {
    return (
      <div className="dash-loading">
        <div className="dash-spinner" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-brand">Jam</a>
          <div className="dash-header-right">
            <span className="dash-greeting">
              {user?.firstName ? `Hey, ${user.firstName}` : 'Dashboard'}
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-top">
          <h2 className="dash-title">Your Instances</h2>
          <button className="dash-create-btn" onClick={() => alert('Instance creation coming soon!')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Instance
          </button>
        </div>

        <div className="dash-grid">
          {mockInstances.map(inst => (
            <div key={inst.id} className="dash-card">
              <div className="dash-card-header">
                <h3 className="dash-card-name">{inst.name}</h3>
                <span className={`dash-status dash-status-${inst.status}`}>
                  <span className="dash-status-dot" />
                  {inst.status}
                </span>
              </div>
              <div className="dash-card-url">{inst.url}</div>
              <div className="dash-card-footer">
                <span className="dash-card-users">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  {inst.users} {inst.users === 1 ? 'user' : 'users'}
                </span>
                <button
                  className="dash-card-open"
                  disabled={inst.status !== 'running'}
                  onClick={() => window.open(inst.url, '_blank')}
                >
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
