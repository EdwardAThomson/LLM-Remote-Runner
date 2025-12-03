import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiAdapter, ApiBackend, ApiConfig } from './api-adapter.interface';
import { AnthropicApiAdapter } from './anthropic-api.adapter';
import { GeminiApiAdapter } from './gemini-api.adapter';
import { OpenAiApiAdapter } from './openai-api.adapter';

/**
 * Factory for creating and managing API adapter instances
 */
@Injectable()
export class ApiAdapterFactory {
  private readonly logger = new Logger(ApiAdapterFactory.name);
  private readonly adapters = new Map<ApiBackend, ApiAdapter>();
  
  constructor(private readonly configService: ConfigService) {
    this.initializeAdapters();
  }
  
  private initializeAdapters(): void {
    // OpenAI
    const openaiConfig = this.getOpenAiConfig();
    if (openaiConfig.apiKey) {
      this.adapters.set('openai-api', new OpenAiApiAdapter(openaiConfig));
      this.logger.log('OpenAI API adapter initialized');
    }
    
    // Anthropic
    const anthropicConfig = this.getAnthropicConfig();
    if (anthropicConfig.apiKey) {
      this.adapters.set('anthropic-api', new AnthropicApiAdapter(anthropicConfig));
      this.logger.log('Anthropic API adapter initialized');
    }
    
    // Gemini
    const geminiConfig = this.getGeminiApiConfig();
    if (geminiConfig.apiKey) {
      this.adapters.set('gemini-api', new GeminiApiAdapter(geminiConfig));
      this.logger.log('Gemini API adapter initialized');
    }
  }
  
  private getOpenAiConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.openaiApiKey', ''),
      defaultModel: this.configService.get<string>('app.openaiDefaultModel', 'gpt-4o'),
      baseUrl: this.configService.get<string>('app.openaiBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }
  
  private getAnthropicConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.anthropicApiKey', ''),
      defaultModel: this.configService.get<string>('app.anthropicDefaultModel', 'claude-sonnet-4-20250514'),
      baseUrl: this.configService.get<string>('app.anthropicBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }
  
  private getGeminiApiConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.geminiApiKey', ''),
      defaultModel: this.configService.get<string>('app.geminiApiDefaultModel', 'gemini-1.5-pro'),
      baseUrl: this.configService.get<string>('app.geminiApiBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }
  
  /**
   * Get an adapter by backend name
   */
  getAdapter(backend: ApiBackend): ApiAdapter {
    const adapter = this.adapters.get(backend);
    if (!adapter) {
      throw new Error(`API adapter not available: ${backend}`);
    }
    return adapter;
  }
  
  /**
   * Check if an adapter is available and configured
   */
  hasAdapter(backend: ApiBackend): boolean {
    const adapter = this.adapters.get(backend);
    return adapter?.isConfigured() ?? false;
  }
  
  /**
   * Get all available (configured) API backends
   */
  getAvailableBackends(): ApiBackend[] {
    return Array.from(this.adapters.entries())
      .filter(([, adapter]) => adapter.isConfigured())
      .map(([backend]) => backend);
  }
  
  /**
   * Check if a backend string is an API backend
   */
  static isApiBackend(backend: string): backend is ApiBackend {
    return ['openai-api', 'anthropic-api', 'gemini-api'].includes(backend);
  }
}
