/**
 * LLM Adapters Module
 *
 * Exports all adapter-related types, classes, and factories.
 * Supports both CLI-based and API-based LLM backends.
 */

// ============================================
// CLI Adapters
// ============================================

// CLI interface and types
export {
  CliAdapter,
  CliBackend,
  CliConfig,
  CliInvocation,
  CliCommandOptions,
  CliOutputResult,
} from './cli-adapter.interface';

// CLI base adapter
export { BaseCliAdapter } from './base-cli.adapter';

// CLI concrete adapters
export { CodexAdapter, DEFAULT_CODEX_CONFIG } from './codex.adapter';
export { ClaudeCliAdapter, DEFAULT_CLAUDE_CONFIG } from './claude-cli.adapter';
export { GeminiCliAdapter, DEFAULT_GEMINI_CONFIG } from './gemini-cli.adapter';

// CLI factory
export { AdapterFactory, AdapterConfigs } from './adapter.factory';

// ============================================
// API Adapters
// ============================================

// API interface and types
export {
  ApiAdapter,
  ApiBackend,
  ApiConfig,
  ApiRequestOptions,
  ApiResponse,
  ApiStreamChunk,
} from './api-adapter.interface';

// API base adapter
export { BaseApiAdapter } from './base-api.adapter';

// API concrete adapters
export { OpenAiApiAdapter } from './openai-api.adapter';
export { AnthropicApiAdapter } from './anthropic-api.adapter';
export { GeminiApiAdapter } from './gemini-api.adapter';

// API factory
export { ApiAdapterFactory } from './api-adapter.factory';

// ============================================
// Unified Types
// ============================================

import type { CliBackend as CliBackendType } from './cli-adapter.interface';
import type { ApiBackend as ApiBackendType } from './api-adapter.interface';

/** All supported backends (CLI + API) */
export type AnyBackend = CliBackendType | ApiBackendType;
