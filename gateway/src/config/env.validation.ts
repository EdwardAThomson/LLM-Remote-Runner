import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  REDIS_URL: Joi.string().uri().allow('').default(''),

  // CLI binary paths (all optional, default to binary name in PATH)
  CODEX_BIN_PATH: Joi.string().default('codex'),
  CLAUDE_BIN_PATH: Joi.string().default('claude'),
  GEMINI_BIN_PATH: Joi.string().default('gemini'),

  // Default model for Gemini CLI
  GEMINI_DEFAULT_MODEL: Joi.string().default('gemini-3-flash-preview'),

  // Default backend for new tasks (CLI or API)
  DEFAULT_BACKEND: Joi.string()
    .valid(
      'codex',
      'claude-cli',
      'gemini-cli',
      'openai-api',
      'anthropic-api',
      'gemini-api',
      'openrouter-api',
      'venice-api',
      'hosted-api',
    )
    .default('codex'),

  // API keys (optional - leave empty to disable that provider)
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  OPENAI_DEFAULT_MODEL: Joi.string().default('gpt-5.5'),
  OPENAI_BASE_URL: Joi.string().uri().allow(''),

  ANTHROPIC_API_KEY: Joi.string().allow('').default(''),
  ANTHROPIC_DEFAULT_MODEL: Joi.string().default('claude-sonnet-4-5-20250929'),
  ANTHROPIC_BASE_URL: Joi.string().uri().allow(''),

  GEMINI_API_KEY: Joi.string().allow('').default(''),
  GEMINI_API_DEFAULT_MODEL: Joi.string().default('gemini-3-flash-preview'),
  GEMINI_API_BASE_URL: Joi.string().uri().allow(''),

  // OpenRouter (OpenAI-compatible router). Env names match the Python
  // llm-backends package: OPENROUTER_API_KEY / OPENROUTER_MODEL.
  OPENROUTER_API_KEY: Joi.string().allow('').default(''),
  OPENROUTER_MODEL: Joi.string().default('deepseek/deepseek-chat'),
  OPENROUTER_BASE_URL: Joi.string().uri().allow(''),

  // Venice (OpenAI-compatible host): VENICE_API_KEY / VENICE_MODEL.
  VENICE_API_KEY: Joi.string().allow('').default(''),
  VENICE_MODEL: Joi.string().default('venice-uncensored'),
  VENICE_BASE_URL: Joi.string().uri().allow(''),

  // Self-hosted / local (OpenAI-compatible). Base URL comes from
  // HOSTED_LLM_URL + HOSTED_LLM_PORT, or a full HOSTED_LLM_BASE_URL. Key is
  // optional (local servers often need none).
  HOSTED_LLM_URL: Joi.string().allow(''),
  HOSTED_LLM_PORT: Joi.string().allow(''),
  HOSTED_LLM_BASE_URL: Joi.string().uri().allow(''),
  HOSTED_LLM_API_KEY: Joi.string().allow('').default(''),
  HOSTED_LLM_MODEL: Joi.string().allow('').default(''),

  API_TIMEOUT_MS: Joi.number().integer().positive().default(120000),

  // Auth & JWT
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_ISSUER: Joi.string().default('codex-remote-runner'),

  // Rate limiting
  RATE_LIMIT_POINTS: Joi.number().integer().positive().default(60),
  RATE_LIMIT_DURATION: Joi.number().integer().positive().default(60),
  TASK_HEARTBEAT_MS: Joi.number().integer().positive().default(15000),

  // Logging
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),

  // Workspace allowlist (F-1)
  // Comma-separated absolute paths. DEFAULT_WORKSPACE is always allowed.
  // When set, the requested cwd must be the allowlisted path or a descendant.
  ALLOWED_WORKSPACES: Joi.string().allow('').default(''),

  // Extra env vars to forward to spawned CLIs (F-3)
  // Comma-separated variable names. The base allowlist already covers PATH,
  // HOME, USER, LOGNAME, LANG, LC_ALL, TERM, TMPDIR, SHELL,
  // HTTPS_PROXY, HTTP_PROXY, NO_PROXY.
  EXTRA_SUBPROCESS_ENV: Joi.string().allow('').default(''),

  // SQLite database file path (created on first run if missing).
  DB_PATH: Joi.string().default('./data/runner.db'),

  // CORS allowlist (comma-separated origins). Empty = no cross-origin allowed.
  // Example: CORS_ORIGINS=http://localhost:3001,https://runner.example.com
  CORS_ORIGINS: Joi.string().allow('').default(''),
});
