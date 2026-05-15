import { registerAs } from '@nestjs/config';
import { homedir } from 'os';
import { resolve } from 'path';

import { CliBackend } from '../adapters';

export interface AppConfig {
  port: number;
  // CLI binary paths
  codexBinPath: string;
  claudeBinPath: string;
  geminiBinPath: string;
  // Default models per backend (CLI)
  geminiDefaultModel: string;
  // Default backend for new tasks
  defaultBackend: CliBackend;
  // API keys (optional)
  openaiApiKey: string;
  openaiDefaultModel: string;
  openaiBaseUrl?: string;
  anthropicApiKey: string;
  anthropicDefaultModel: string;
  anthropicBaseUrl?: string;
  geminiApiKey: string;
  geminiApiDefaultModel: string;
  geminiApiBaseUrl?: string;
  apiTimeoutMs: number;
  // Other settings
  redisUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  rateLimitPoints: number;
  rateLimitDuration: number;
  taskHeartbeatMs: number;
  defaultWorkspace: string;
  allowedWorkspaces: string[];
  extraSubprocessEnv: string[];
  adminPasswordHash: string;
  dbPath: string;
  corsOrigins: string[];
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Expands ~ to home directory in paths
 */
function expandPath(path: string): string {
  if (path.startsWith('~/')) {
    return resolve(homedir(), path.slice(2));
  }
  return path;
}

export default registerAs<AppConfig>('app', () => ({
  port: Number(process.env.PORT ?? 3000),
  // CLI binary paths
  codexBinPath: expandPath(process.env.CODEX_BIN_PATH ?? 'codex'),
  claudeBinPath: expandPath(process.env.CLAUDE_BIN_PATH ?? 'claude'),
  geminiBinPath: expandPath(process.env.GEMINI_BIN_PATH ?? 'gemini'),
  // Default models (CLI)
  geminiDefaultModel: process.env.GEMINI_DEFAULT_MODEL ?? 'gemini-3-flash-preview',
  // Default backend
  defaultBackend: (process.env.DEFAULT_BACKEND as CliBackend) ?? 'codex',
  // API keys (optional - leave empty to disable)
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiDefaultModel: process.env.OPENAI_DEFAULT_MODEL ?? 'gpt-5.5',
  openaiBaseUrl: process.env.OPENAI_BASE_URL,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicDefaultModel: process.env.ANTHROPIC_DEFAULT_MODEL ?? 'claude-sonnet-4-5-20250929',
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiApiDefaultModel: process.env.GEMINI_API_DEFAULT_MODEL ?? 'gemini-3-flash-preview',
  geminiApiBaseUrl: process.env.GEMINI_API_BASE_URL,
  apiTimeoutMs: Number(process.env.API_TIMEOUT_MS ?? 120000),
  // Other settings
  redisUrl: process.env.REDIS_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtIssuer: process.env.JWT_ISSUER ?? 'codex-remote-runner',
  rateLimitPoints: Number(process.env.RATE_LIMIT_POINTS ?? 60),
  rateLimitDuration: Number(process.env.RATE_LIMIT_DURATION ?? 60),
  taskHeartbeatMs: Number(process.env.TASK_HEARTBEAT_MS ?? 15000),
  defaultWorkspace: expandPath(
    process.env.DEFAULT_WORKSPACE ?? '~/llm-workspace',
  ),
  allowedWorkspaces: parseList(process.env.ALLOWED_WORKSPACES).map(expandPath),
  extraSubprocessEnv: parseList(process.env.EXTRA_SUBPROCESS_ENV),
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
  dbPath: expandPath(process.env.DB_PATH ?? './data/runner.db'),
  corsOrigins: parseList(process.env.CORS_ORIGINS),
}));
