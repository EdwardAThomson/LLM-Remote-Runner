import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ApiTokenSummary,
  createApiToken,
  listApiTokens,
  MintedToken,
  revokeApiToken,
} from '../lib/api-tokens';
import Header from './Header';

export default function TokensSettings() {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isMinting, setIsMinting] = useState(false);
  const [minted, setMinted] = useState<MintedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiTokenSummary | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listApiTokens();
      setTokens(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleMint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setIsMinting(true);
    setError(null);
    try {
      const result = await createApiToken(name.trim());
      setMinted(result);
      setName('');
      setTokens((prev) => [result.summary, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mint token');
    } finally {
      setIsMinting(false);
    }
  };

  const confirmRevoke = async () => {
    if (!pendingRevoke) return;
    setIsRevoking(true);
    try {
      const updated = await revokeApiToken(pendingRevoke.id);
      setTokens((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setPendingRevoke(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    } finally {
      setIsRevoking(false);
    }
  };

  const copyMinted = async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard unavailable — copy manually.');
    }
  };

  return (
    <>
      <Header />
      <div className="settings-page">
        <h2 className="settings-title">API tokens</h2>
        <p className="settings-description">
          Long-lived bearer tokens for services that call the gateway directly.
          Use these to authenticate non-interactive callers — never paste them
          into a public commit or share them across services.
        </p>

        {error ? <p className="error-banner">{error}</p> : null}

        <section className="settings-section">
          <h3 className="settings-subtitle">Create a token</h3>
          <form onSubmit={handleMint} className="token-create-form">
            <input
              type="text"
              className="form-input"
              placeholder="Token name (e.g. ‘nightly-batch’)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isMinting}
              maxLength={100}
              required
            />
            <button
              type="submit"
              className="primary-button"
              disabled={isMinting || !name.trim()}
            >
              {isMinting ? 'Creating…' : 'Create token'}
            </button>
          </form>
        </section>

        <section className="settings-section">
          <h3 className="settings-subtitle">Existing tokens</h3>
          {loading && tokens.length === 0 ? (
            <p className="muted">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="muted">No tokens yet.</p>
          ) : (
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Created</th>
                    <th>Last used</th>
                    <th>Status</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => {
                    const isRevoked = !!token.revokedAt;
                    return (
                      <tr key={token.id}>
                        <td>{token.name}</td>
                        <td>{formatRelativeTime(token.createdAt)}</td>
                        <td>
                          {token.lastUsedAt
                            ? formatRelativeTime(token.lastUsedAt)
                            : '—'}
                        </td>
                        <td>
                          <span
                            className={`state-badge ${
                              isRevoked ? 'state-canceled' : 'state-completed'
                            }`}
                          >
                            {isRevoked ? 'Revoked' : 'Active'}
                          </span>
                        </td>
                        <td>
                          {isRevoked ? null : (
                            <button
                              type="button"
                              className="link-button danger"
                              onClick={() => setPendingRevoke(token)}
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {minted ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="token-reveal-title"
        >
          <div className="modal-card">
            <div className="modal-header">
              <h2 id="token-reveal-title" className="modal-title">Save this token now</h2>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                This is the only time the full token will be shown. Copy it
                somewhere safe — you can't see it again.
              </p>
              <div className="token-reveal">
                <code className="token-reveal-value">{minted.token}</code>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={copyMinted}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setMinted(null);
                  setCopied(false);
                }}
              >
                I've saved it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRevoke ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-modal-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isRevoking) {
              setPendingRevoke(null);
            }
          }}
        >
          <div className="modal-card modal-card-narrow">
            <div className="modal-header">
              <h2 id="revoke-modal-title" className="modal-title">Revoke token?</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setPendingRevoke(null)}
                disabled={isRevoking}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Services using <strong>{pendingRevoke.name}</strong> will
                immediately stop being able to authenticate. This cannot be undone.
              </p>
            </div>
            <div className="modal-footer modal-footer-spread">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingRevoke(null)}
                disabled={isRevoking}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={confirmRevoke}
                disabled={isRevoking}
              >
                {isRevoking ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
