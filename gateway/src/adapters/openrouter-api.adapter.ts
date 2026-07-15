import { OpenAiCompatibleApiAdapter } from './openai-compatible-api.adapter';

/**
 * OpenRouter API adapter.
 *
 * OpenRouter (https://openrouter.ai) is a hosted, OpenAI-compatible router over
 * many upstream providers, so it is the shared base pointed at OpenRouter's
 * base URL with an OpenRouter key. Any upstream model id (e.g.
 * `deepseek/deepseek-chat`) works via config/request override;
 * `getAvailableModels()` only advertises the convenience set mirrored from the
 * Python `llm-backends` registry.
 */
export class OpenRouterApiAdapter extends OpenAiCompatibleApiAdapter {
  readonly backend = 'openrouter-api' as const;
  readonly displayName = 'OpenRouter';

  protected getDefaultBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }

  getAvailableModels(): string[] {
    // Convenience keys mirrored from the Python registry's "openrouter-*"
    // entries. Any other OpenRouter model works when named via config/request.
    return ['deepseek/deepseek-chat', 'anthropic/claude-haiku-4.5'];
  }
}
