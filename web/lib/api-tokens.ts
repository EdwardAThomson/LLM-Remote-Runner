import { getToken } from './auth';

export interface ApiTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface MintedToken {
  summary: ApiTokenSummary;
  /** Plaintext token, only returned once on creation. */
  token: string;
}

function getGatewayBaseUrl(): string {
  return process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3000';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listApiTokens(): Promise<ApiTokenSummary[]> {
  const response = await fetch(`${getGatewayBaseUrl()}/api/tokens`, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to list tokens (${response.status}): ${await response.text()}`,
    );
  }
  const data = (await response.json()) as { items: ApiTokenSummary[] };
  return data.items;
}

export async function createApiToken(name: string): Promise<MintedToken> {
  const response = await fetch(`${getGatewayBaseUrl()}/api/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create token (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as MintedToken;
}

export async function revokeApiToken(id: string): Promise<ApiTokenSummary> {
  const response = await fetch(`${getGatewayBaseUrl()}/api/tokens/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to revoke token (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as ApiTokenSummary;
}
