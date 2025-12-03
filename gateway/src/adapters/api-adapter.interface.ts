/**
 * API-based LLM adapter interface
 * 
 * Unlike CLI adapters that spawn processes, API adapters make HTTP requests
 * to cloud-hosted LLM services.
 */

/**
 * Supported API backends
 */
export type ApiBackend = 'openai-api' | 'anthropic-api' | 'gemini-api';

/**
 * Configuration for API adapters
 */
export interface ApiConfig {
  /** API key for authentication */
  apiKey: string;
  /** Default model to use */
  defaultModel: string;
  /** Optional base URL override (for proxies or custom endpoints) */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Options for API requests
 */
export interface ApiRequestOptions {
  /** The prompt to send */
  prompt: string;
  /** Model override (uses default if not specified) */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for response randomness (0-1) */
  temperature?: number;
  /** System prompt/instructions */
  systemPrompt?: string;
}

/**
 * Streaming chunk from API response
 */
export interface ApiStreamChunk {
  /** Text content of this chunk */
  content: string;
  /** Whether this is the final chunk */
  done: boolean;
  /** Token usage info (only on final chunk) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Complete API response (non-streaming)
 */
export interface ApiResponse {
  /** Full response content */
  content: string;
  /** Model used */
  model: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Response finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
}

/**
 * Interface for API-based LLM adapters
 */
export interface ApiAdapter {
  /** Backend identifier */
  readonly backend: ApiBackend;
  
  /** Human-readable name */
  readonly displayName: string;
  
  /** Check if the adapter is configured (has API key) */
  isConfigured(): boolean;
  
  /** Get the default model for this adapter */
  getDefaultModel(): string;
  
  /** Get available models (if known) */
  getAvailableModels(): string[];
  
  /**
   * Send a prompt and get a complete response
   */
  complete(options: ApiRequestOptions): Promise<ApiResponse>;
  
  /**
   * Send a prompt and stream the response
   * Returns an async iterator of chunks
   */
  stream(options: ApiRequestOptions): AsyncIterable<ApiStreamChunk>;
}
