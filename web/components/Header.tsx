'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '../lib/auth';

export default function Header() {
  const pathname = usePathname();
  const isDashboard = pathname === '/';
  const isNewTask = pathname?.startsWith('/tasks/new');
  const isSettings = pathname?.startsWith('/settings');

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <h1>LLM Remote Runner</h1>
        <p>Execute LLM tasks safely from the browser using multiple backends.</p>
      </div>
      <nav className="app-nav">
        <Link
          href="/"
          className={`nav-link${isDashboard ? ' nav-link-active' : ''}`}
        >
          Dashboard
        </Link>
        <Link
          href="/tasks/new"
          className={`nav-link${isNewTask ? ' nav-link-active' : ''}`}
        >
          New Task
        </Link>
        <Link
          href="/settings/tokens"
          className={`nav-link${isSettings ? ' nav-link-active' : ''}`}
        >
          Settings
        </Link>
        <button onClick={logout} className="secondary-button">
          Logout
        </button>
      </nav>
    </header>
  );
}
