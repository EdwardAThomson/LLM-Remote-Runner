'use client';

import { logout } from '../lib/auth';

export default function Header() {
  return (
    <header className="app-header">
      <div>
        <h1>Codex Remote Runner</h1>
        <p>Execute Codex tasks safely from the browser.</p>
      </div>
      <button
        onClick={logout}
        className="secondary-button"
        style={{ alignSelf: 'flex-start' }}
      >
        Logout
      </button>
    </header>
  );
}
