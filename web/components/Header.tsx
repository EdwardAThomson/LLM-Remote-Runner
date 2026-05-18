import { Link, useLocation } from 'react-router-dom';
import { logout } from '../lib/auth';

export default function Header() {
  const { pathname } = useLocation();
  const isConversations =
    pathname === '/' || pathname.startsWith('/conversations');
  const isTasks = pathname.startsWith('/tasks');
  const isSettings = pathname.startsWith('/settings');

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <h1>LLM Remote Runner</h1>
        <p>Execute LLM tasks safely from the browser using multiple backends.</p>
      </div>
      <nav className="app-nav">
        <Link
          to="/"
          className={`nav-link${isConversations ? ' nav-link-active' : ''}`}
        >
          Conversations
        </Link>
        <Link
          to="/tasks"
          className={`nav-link${isTasks ? ' nav-link-active' : ''}`}
        >
          Tasks
        </Link>
        <Link
          to="/settings/tokens"
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
