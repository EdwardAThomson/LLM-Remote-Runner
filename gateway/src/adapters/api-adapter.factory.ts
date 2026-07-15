import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiAdapter, ApiBackend, ApiConfig } from './api-adapter.interface';
import { AnthropicApiAdapter } from './anthropic-api.adapter';
import { GeminiApiAdapter } from './gemini-api.adapter';
import { OpenAiApiAdapter } from './openai-api.adapter';
import { OpenRouterApiAdapter } from './openrouter-api.adapter';
import { VeniceApiAdapter } from './venice-api.adapter';
import { HostedApiAdapter } from './hosted-api.adapter';

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

    // OpenRouter (OpenAI-compatible router)
    const openRouterConfig = this.getOpenRouterConfig();
    if (openRouterConfig.apiKey) {
      this.adapters.set('openrouter-api', new OpenRouterApiAdapter(openRouterConfig));
      this.logger.log('OpenRouter API adapter initialized');
    }

    // Venice (OpenAI-compatible host)
    const veniceConfig = this.getVeniceConfig();
    if (veniceConfig.apiKey) {
      this.adapters.set('venice-api', new VeniceApiAdapter(veniceConfig));
      this.logger.log('Venice API adapter initialized');
    }

    // Self-hosted / local (OpenAI-compatible). Keyed on a base URL rather than a
    // key: local servers often need no key.
    const hostedConfig = this.getHostedConfig();
    if (hostedConfig.baseUrl) {
      this.adapters.set('hosted-api', new HostedApiAdapter(hostedConfig));
      this.logger.log('Self-hosted API adapter initialized');
    }
  }
  
  private getOpenAiConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.openaiApiKey', ''),
      defaultModel: this.configService.get<string>('app.openaiDefaultModel', 'gpt-5.5'),
      baseUrl: this.configService.get<string>('app.openaiBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }
  
  private getAnthropicConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.anthropicApiKey', ''),
      defaultModel: this.configService.get<string>('app.anthropicDefaultModel', 'claude-sonnet-4-5-20250929'),
      baseUrl: this.configService.get<string>('app.anthropicBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }
  
  private getGeminiApiConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.geminiApiKey', ''),
      defaultModel: this.configService.get<string>('app.geminiApiDefaultModel', 'gemini-3-flash-preview'),
      baseUrl: this.configService.get<string>('app.geminiApiBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }

  private getOpenRouterConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.openRouterApiKey', ''),
      defaultModel: this.configService.get<string>('app.openRouterDefaultModel', 'deepseek/deepseek-chat'),
      baseUrl: this.configService.get<string>('app.openRouterBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }

  private getVeniceConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.veniceApiKey', ''),
      defaultModel: this.configService.get<string>('app.veniceDefaultModel', 'venice-uncensored'),
      baseUrl: this.configService.get<string>('app.veniceBaseUrl'),
      timeoutMs: this.configService.get<number>('app.apiTimeoutMs', 120000),
    };
  }

  private getHostedConfig(): ApiConfig {
    return {
      apiKey: this.configService.get<string>('app.hostedApiKey', ''),
      defaultModel: this.configService.get<string>('app.hostedDefaultModel', ''),
      baseUrl: this.configService.get<string>('app.hostedBaseUrl'),
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
    return [
      'openai-api',
      'anthropic-api',
      'gemini-api',
      'openrouter-api',
      'venice-api',
      'hosted-api',
    ].includes(backend);
  }
}
