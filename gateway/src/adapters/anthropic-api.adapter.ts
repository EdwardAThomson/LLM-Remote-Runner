import {
  ApiConfig,
  ApiRequestOptions,
  ApiResponse,
  ApiStreamChunk,
} from './api-adapter.interface';
import { BaseApiAdapter } from './base-api.adapter';

/**
 * Anthropic API adapter
 * Supports Claude 3.5, Claude 3, and other Anthropic models
 */
export class AnthropicApiAdapter extends BaseApiAdapter {
  readonly backend = 'anthropic-api' as const;
  readonly displayName = 'Anthropic API';
  
  private readonly baseUrl: string;
  private readonly apiVersion = '2023-06-01';
  
  constructor(config: ApiConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
  }
  
  getAvailableModels(): string[] {
    return [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }
  
  async complete(options: ApiRequestOptions): Promise<ApiResponse> {
    const controller = this.createTimeoutController();
    
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(this.buildRequestBody(options, false)),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    
    // Extract text from content blocks
    const content = data.content
      ?.filter((block: { type: string }) => block.type === 'text')
      .map((block: { text: string }) => block.text)
      .join('') ?? '';
    
    return {
      content,
      model: data.model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      finishReason: this.mapStopReason(data.stop_reason),
    };
  }
  
  async *stream(options: ApiRequestOptions): AsyncIterable<ApiStreamChunk> {
    const controller = this.createTimeoutController();
    
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(this.buildRequestBody(options, true)),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          yield { content: '', done: true, usage };
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          const data = trimmed.slice(6);
          
          try {
            const parsed = JSON.parse(data);
            
            // Handle different event types
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text ?? '';
              if (text) {
                yield { content: text, done: false };
              }
            } else if (parsed.type === 'message_delta') {
              // Final message with usage
              if (parsed.usage) {
                usage = {
                  promptTokens: parsed.usage.input_tokens ?? 0,
                  completionTokens: parsed.usage.output_tokens ?? 0,
                  totalTokens: (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0),
                };
              }
            } else if (parsed.type === 'message_stop') {
              yield { content: '', done: true, usage };
              return;
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
    return {
      model: this.getModel(options),
      max_tokens: options.maxTokens ?? 4096,
      messages: [{ role: 'user', content: options.prompt }],
      stream,
      ...(options.systemPrompt && { system: options.systemPrompt }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    };
  }
  
  private mapStopReason(reason: string | undefined): ApiResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }
}
