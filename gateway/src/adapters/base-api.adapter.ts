import {
  ApiAdapter,
  ApiBackend,
  ApiConfig,
  ApiRequestOptions,
  ApiResponse,
  ApiStreamChunk,
} from './api-adapter.interface';

/**
 * Abstract base class for API adapters
 * Provides common functionality and default implementations
 */
export abstract class BaseApiAdapter implements ApiAdapter {
  abstract readonly backend: ApiBackend;
  abstract readonly displayName: string;
  
  protected readonly config: ApiConfig;
  
  constructor(config: ApiConfig) {
    this.config = config;
  }
  
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.apiKey.length > 0);
  }
  
  getDefaultModel(): string {
    return this.config.defaultModel;
  }
  
  abstract getAvailableModels(): string[];
  abstract complete(options: ApiRequestOptions): Promise<ApiResponse>;
  abstract stream(options: ApiRequestOptions): AsyncIterable<ApiStreamChunk>;
  
  /**
   * Get the effective model (request override or default)
   */
  protected getModel(options: ApiRequestOptions): string {
    return options.model ?? this.config.defaultModel;
  }
  
  /**
   * Get timeout in milliseconds
   */
  protected getTimeoutMs(): number {
    return this.config.timeoutMs ?? 120000; // 2 minutes default
  }
  
  /**
   * Create an AbortController with timeout
   */
  protected createTimeoutController(): AbortController {
    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs();
    
    if (timeoutMs > 0) {
      setTimeout(() => controller.abort(), timeoutMs);
    }
    
    return controller;
  }
}
