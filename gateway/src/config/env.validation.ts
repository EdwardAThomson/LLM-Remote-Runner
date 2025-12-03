import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  REDIS_URL: Joi.string().uri().allow('').default(''),

  // CLI binary paths (all optional, default to binary name in PATH)
  CODEX_BIN_PATH: Joi.string().default('codex'),
  CLAUDE_BIN_PATH: Joi.string().default('claude'),
  GEMINI_BIN_PATH: Joi.string().default('gemini'),

  // Default model for Gemini CLI
  GEMINI_DEFAULT_MODEL: Joi.string().default('gemini-2.5-pro'),

  // Default backend for new tasks (CLI or API)
  DEFAULT_BACKEND: Joi.string()
    .valid('codex', 'claude-cli', 'gemini-cli', 'openai-api', 'anthropic-api', 'gemini-api')
    .default('codex'),

  // API keys (optional - leave empty to disable that provider)
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  OPENAI_DEFAULT_MODEL: Joi.string().default('gpt-4o'),
  OPENAI_BASE_URL: Joi.string().uri().allow(''),

  ANTHROPIC_API_KEY: Joi.string().allow('').default(''),
  ANTHROPIC_DEFAULT_MODEL: Joi.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_BASE_URL: Joi.string().uri().allow(''),

  GEMINI_API_KEY: Joi.string().allow('').default(''),
  GEMINI_API_DEFAULT_MODEL: Joi.string().default('gemini-1.5-pro'),
  GEMINI_API_BASE_URL: Joi.string().uri().allow(''),

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
});
