'use client';

import { logout } from '../lib/auth';

export default function Header() {
  return (
    <header className="app-header">
      <div>
        <h1>LLM Remote Runner</h1>
        <p>Execute LLM tasks safely from the browser using multiple backends.</p>
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
