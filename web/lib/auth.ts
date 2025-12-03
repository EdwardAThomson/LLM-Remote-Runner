import Cookies from 'js-cookie';

const TOKEN_KEY = 'codex_session_token';
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';

export interface LoginResponse {
  access_token: string;
}

export interface SessionResponse {
  user: {
    userId: string;
    username: string;
  };
  authenticated: boolean;
}

export async function login(password: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed: ${error}`);
  }

  const data: LoginResponse = await response.json();
  setToken(data.access_token);
  return data.access_token;
}

export async function checkSession(): Promise<SessionResponse | null> {
  const token = getToken();
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/api/auth/session`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      clearToken();
      return null;
    }

    return await response.json();
  } catch (error) {
    clearToken();
    return null;
  }
}

export function getToken(): string | undefined {
  return Cookies.get(TOKEN_KEY);
}

export function setToken(token: string): void {
  Cookies.set(TOKEN_KEY, token, {
    expires: 1, // 1 day
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}

export function clearToken(): void {
  Cookies.remove(TOKEN_KEY);
}

export function logout(): void {
  clearToken();
  window.location.href = '/login';
}
