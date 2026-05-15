import { INestApplication, Logger } from '@nestjs/common';
import * as express from 'express';
import { NextFunction, Request, Response } from 'express';
import { AuthService } from './auth.service';

const COOKIE_NAME = 'runner_docs_session';
const LOGIN_PATH = '/api/docs/login';
const PROTECTED_PREFIX = '/api/docs';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Mount the Swagger-docs login + cookie auth.
 *
 * Visiting `/api/docs/*` without a valid session cookie redirects to the
 * password-only form at `/api/docs/login`. Successful login sets an
 * HttpOnly cookie (scoped to `/api/docs`) carrying the same JWT the web
 * app uses, and redirects back to the originally-requested URL.
 *
 * Order matters: call this BEFORE `SwaggerModule.setup` so the middleware
 * intercepts before Swagger's route handlers.
 */
export function mountDocsSession(
  app: INestApplication,
  authService: AuthService,
): void {
  const logger = new Logger('DocsSession');

  // Parse form-encoded POST bodies for the login submission.
  app.use(LOGIN_PATH, express.urlencoded({ extended: false }));

  // Login routes (handled before the auth middleware below).
  app.use(LOGIN_PATH, async (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') {
      const hasError = req.query.error === '1';
      const nextUrl = sanitizeNext(req.query.next);
      res.type('html').send(renderLogin(hasError, nextUrl));
      return;
    }

    if (req.method === 'POST') {
      const password = (req.body?.password as string | undefined) ?? '';
      const nextUrl = sanitizeNext(req.body?.next);
      if (!password) {
        res.redirect(`${LOGIN_PATH}?error=1&next=${encodeURIComponent(nextUrl)}`);
        return;
      }
      try {
        const { access_token } = await authService.login(password);
        res.cookie(COOKIE_NAME, access_token, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: COOKIE_MAX_AGE_MS,
          path: PROTECTED_PREFIX,
        });
        res.redirect(nextUrl);
      } catch (err) {
        logger.warn(`Docs login failed: ${String(err)}`);
        res.redirect(`${LOGIN_PATH}?error=1&next=${encodeURIComponent(nextUrl)}`);
      }
      return;
    }

    next();
  });

  // Cookie auth for everything else under /api/docs.
  app.use(
    PROTECTED_PREFIX,
    async (req: Request, res: Response, next: NextFunction) => {
      // The login routes above don't call next() on GET/POST, but be defensive.
      if (req.path === '/login' || req.path.startsWith('/login/')) return next();

      const token = readCookie(req.headers.cookie ?? '', COOKIE_NAME);
      if (!token) {
        res.redirect(`${LOGIN_PATH}?next=${encodeURIComponent(req.originalUrl)}`);
        return;
      }
      try {
        await authService.validateSession(token);
        next();
      } catch {
        res.redirect(`${LOGIN_PATH}?next=${encodeURIComponent(req.originalUrl)}`);
      }
    },
  );
}

function sanitizeNext(raw: unknown): string {
  if (typeof raw !== 'string') return PROTECTED_PREFIX;
  if (!raw.startsWith(PROTECTED_PREFIX)) return PROTECTED_PREFIX;
  return raw;
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function renderLogin(hasError: boolean, nextUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API docs · Sign in</title>
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { background: #fff; border-radius: 1rem; padding: 2.5rem; max-width: 380px; width: 100%; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); }
    h1 { margin: 0 0 0.5rem; font-size: 1.4rem; color: #111; text-align: center; }
    p { margin: 0 0 1.75rem; color: #64748b; font-size: 0.9rem; text-align: center; }
    form { display: flex; flex-direction: column; gap: 1rem; }
    input[type=password] { padding: 0.85rem 0.95rem; border: 2px solid #e2e8f0; border-radius: 0.5rem; font-size: 1rem; font-family: inherit; }
    input[type=password]:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1); }
    button { padding: 0.85rem; border-radius: 0.5rem; border: 0; background: #4f46e5; color: #fff; font-weight: 600; cursor: pointer; font-size: 1rem; }
    button:hover { background: #4338ca; }
    .error { padding: 0.7rem 0.9rem; background: #fee2e2; color: #991b1b; border-left: 3px solid #dc2626; border-radius: 0.5rem; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>API documentation</h1>
    <p>Sign in with the admin password to continue.</p>
    ${hasError ? '<div class="error">Incorrect password.</div>' : ''}
    <form method="POST" action="${LOGIN_PATH}">
      <input type="password" name="password" autofocus required autocomplete="current-password" placeholder="Password" />
      <input type="hidden" name="next" value="${escapeHtml(nextUrl)}" />
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[c] as string,
  );
}
