import {
  ApiRequestOptions,
  ApiResponse,
  ApiStreamChunk,
} from './api-adapter.interface';
import { BaseApiAdapter } from './base-api.adapter';

/**
 * Shared base for OpenAI-compatible chat-completions backends.
 *
 * Speaks the OpenAI `/chat/completions` protocol (bearer-key auth, SSE
 * streaming) over a configurable `baseUrl`. OpenAI itself, OpenRouter, Venice
 * and self-hosted servers (Ollama, llama.cpp, vLLM, ...) all share this shape,
 * so each concrete adapter only differs by its default base URL, key/model
 * source, model list and displayName.
 *
 * Provider-specific request-body additions go through the {@link extraBodyParams}
 * hook (default: none) so, for example, Venice can inject `venice_parameters`
 * without touching the shared wire logic.
 */
export abstract class OpenAiCompatibleApiAdapter extends BaseApiAdapter {
  protected readonly baseUrl: string;

  constructor(config: ConstructorParameters<typeof BaseApiAdapter>[0]) {
    super(config);
    this.baseUrl = config.baseUrl ?? this.getDefaultBaseUrl();
  }

  /** Default base URL used when config does not supply one. */
  protected abstract getDefaultBaseUrl(): string;

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
      throw new Error(`${this.displayName} error (${response.status}): ${error}`);
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
      throw new Error(`${this.displayName} error (${response.status}): ${error}`);
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

  /**
   * Provider-specific extra fields to merge into the request body. Default:
   * none. Override to inject vendor extensions (e.g. Venice's
   * `venice_parameters`). An OpenAI-compatible server that does not know a
   * field simply ignores it, so this only ever adds keys for the provider that
   * opts in.
   */
  protected extraBodyParams(
    _options: ApiRequestOptions,
  ): Record<string, unknown> {
    return {};
  }

  protected buildRequestBody(options: ApiRequestOptions, stream: boolean) {
    const messages: Array<{ role: string; content: string }> = [];

    if (options.messages && options.messages.length > 0) {
      // Multi-turn: pass the transcript through. If the caller supplied a
      // systemPrompt but no system-role message, prepend one.
      const hasSystem = options.messages.some((m) => m.role === 'system');
      if (options.systemPrompt && !hasSystem) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      for (const m of options.messages) {
        messages.push({ role: m.role, content: m.content });
      }
    } else {
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: options.prompt });
    }

    return {
      model: this.getModel(options),
      messages,
      stream,
      ...(options.maxTokens && { max_tokens: options.maxTokens }),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...this.extraBodyParams(options),
    };
  }

  protected mapFinishReason(
    reason: string | undefined,
  ): ApiResponse['finishReason'] {
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
