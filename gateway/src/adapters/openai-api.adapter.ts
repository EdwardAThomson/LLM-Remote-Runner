import {
  ApiConfig,
  ApiRequestOptions,
  ApiResponse,
  ApiStreamChunk,
} from './api-adapter.interface';
import { BaseApiAdapter } from './base-api.adapter';

/**
 * OpenAI API adapter
 * Supports GPT-4, GPT-3.5-turbo, and other OpenAI models
 */
export class OpenAiApiAdapter extends BaseApiAdapter {
  readonly backend = 'openai-api' as const;
  readonly displayName = 'OpenAI API';
  
  private readonly baseUrl: string;
  
  constructor(config: ApiConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }
  
  getAvailableModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
    ];
  }
  
  async complete(options: ApiRequestOptions): Promise<ApiResponse> {
    const controller = this.createTimeoutController();
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(this.buildRequestBody(options, false)),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    
    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      finishReason: this.mapFinishReason(data.choices[0]?.finish_reason),
    };
  }
  
  async *stream(options: ApiRequestOptions): AsyncIterable<ApiStreamChunk> {
    const controller = this.createTimeoutController();
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(this.buildRequestBody(options, true)),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          yield { content: '', done: true };
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content ?? '';
            if (content) {
              yield { content, done: false };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  private buildRequestBody(options: ApiRequestOptions, stream: boolean) {
    const messages: Array<{ role: string; content: string }> = [];
    
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    
    messages.push({ role: 'user', content: options.prompt });
    
    return {
      model: this.getModel(options),
      messages,
      stream,
      ...(options.maxTokens && { max_tokens: options.maxTokens }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    };
  }
  
  private mapFinishReason(reason: string | undefined): ApiResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
