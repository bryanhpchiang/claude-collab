export function ForbiddenPage() {
  return (
    <body className="page-forbidden">
      <div className="forbidden-card">
        <div className="forbidden-brand">Jam</div>
        <span className="forbidden-lock-icon">🔒</span>
        <h1 className="forbidden-heading">You don't have access to this jam</h1>
        <p className="forbidden-subtext">Have the owner of this jam send you an invite link.</p>
        <div className="forbidden-divider"></div>
        <a className="forbidden-btn-dashboard" href="/dashboard">
          <span>&#8592;</span>
          Go to Dashboard
        </a>
      </div>
    </body>
  );
}
