import {
  ApiConfig,
  ApiRequestOptions,
  ApiResponse,
  ApiStreamChunk,
} from './api-adapter.interface';
import { BaseApiAdapter } from './base-api.adapter';

/**
 * Google Gemini API adapter
 * Supports Gemini Pro, Gemini Flash, and other Google AI models
 */
export class GeminiApiAdapter extends BaseApiAdapter {
  readonly backend = 'gemini-api' as const;
  readonly displayName = 'Gemini API';
  
  private readonly baseUrl: string;
  
  constructor(config: ApiConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }
  
  getAvailableModels(): string[] {
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.0-pro',
    ];
  }
  
  async complete(options: ApiRequestOptions): Promise<ApiResponse> {
    const controller = this.createTimeoutController();
    const model = this.getModel(options);
    
    const response = await fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildRequestBody(options)),
        signal: controller.signal,
      },
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    
    // Extract text from candidates
    const content = data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('') ?? '';
    
    const usageMetadata = data.usageMetadata ?? {};
    
    return {
      content,
      model,
      usage: {
        promptTokens: usageMetadata.promptTokenCount ?? 0,
        completionTokens: usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: usageMetadata.totalTokenCount ?? 0,
      },
      finishReason: this.mapFinishReason(data.candidates?.[0]?.finishReason),
    };
  }
  
  async *stream(options: ApiRequestOptions): AsyncIterable<ApiStreamChunk> {
    const controller = this.createTimeoutController();
    const model = this.getModel(options);
    
    const response = await fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildRequestBody(options)),
        signal: controller.signal,
      },
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
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
            
            // Extract text from candidates
            const text = parsed.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => part.text ?? '')
              .join('') ?? '';
            
            if (text) {
              yield { content: text, done: false };
            }
            
            // Update usage if present
            if (parsed.usageMetadata) {
              usage = {
                promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: parsed.usageMetadata.totalTokenCount ?? 0,
              };
            }
            
            // Check for finish
            const finishReason = parsed.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== 'FINISH_REASON_UNSPECIFIED') {
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
  
  private buildRequestBody(options: ApiRequestOptions) {
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    // Add system instruction if provided
    const systemInstruction = options.systemPrompt
      ? { parts: [{ text: options.systemPrompt }] }
      : undefined;
    
    // Add user message
    contents.push({
      role: 'user',
      parts: [{ text: options.prompt }],
    });
    
    return {
      contents,
      ...(systemInstruction && { systemInstruction }),
      generationConfig: {
        ...(options.maxTokens && { maxOutputTokens: options.maxTokens }),
        ...(options.temperature !== undefined && { temperature: options.temperature }),
      },
    };
  }
  
  private mapFinishReason(reason: string | undefined): ApiResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
