/**
 * Base allowlist of environment variables forwarded to spawned CLI processes.
 * Everything else from the gateway's process.env is stripped to prevent
 * leakage of JWT_SECRET, ADMIN_PASSWORD_HASH, and unused provider API keys
 * (F-3 in docs/SECURITY.md).
 */
const BASE_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TMPDIR',
  'SHELL',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'no_proxy',
] as const;

export interface BuildSubprocessEnvOptions {
  /** Extra variable names from EXTRA_SUBPROCESS_ENV. */
  extra?: string[];
  /** Adapter-specific additions (e.g. ANTHROPIC_API_KEY for the Claude CLI). */
  adapterEnv?: Record<string, string | undefined>;
  /** Source env (defaults to process.env). Injected for testability. */
  source?: NodeJS.ProcessEnv;
}

/**
 * Build the env handed to a spawned CLI subprocess. Only allowlisted variables
 * from the source env are forwarded; adapter overrides win over the source.
 */
export function buildSubprocessEnv(
  options: BuildSubprocessEnvOptions = {},
): Record<string, string> {
  const source = options.source ?? process.env;
  const extra = options.extra ?? [];
  const adapterEnv = options.adapterEnv ?? {};

  const names = new Set<string>([...BASE_ENV_ALLOWLIST, ...extra]);
  const result: Record<string, string> = {};

  for (const name of names) {
    const value = source[name];
    if (typeof value === 'string') {
      result[name] = value;
    }
  }

  for (const [name, value] of Object.entries(adapterEnv)) {
    if (typeof value === 'string') {
      result[name] = value;
    }
  }

  return result;
}

export { BASE_ENV_ALLOWLIST };
