import { ApiRequestOptions } from './api-adapter.interface';
import { OpenAiCompatibleApiAdapter } from './openai-compatible-api.adapter';

/**
 * Venice API adapter.
 *
 * Venice (https://venice.ai) is an OpenAI-compatible host of open-weight and
 * uncensored models. Model ids are user-driven (set via config/request), so
 * `getAvailableModels()` only lists a sensible default.
 *
 * Venice injects its own default system prompt unless told not to. This gateway
 * supplies its own system/user prompts, so Venice's must not stack on top: we
 * set `venice_parameters.include_venice_system_prompt = false` on every
 * request. An OpenAI-compatible server that does not know the field ignores it.
 */
export class VeniceApiAdapter extends OpenAiCompatibleApiAdapter {
  readonly backend = 'venice-api' as const;
  readonly displayName = 'Venice';

  protected getDefaultBaseUrl(): string {
    return 'https://api.venice.ai/api/v1';
  }

  getAvailableModels(): string[] {
    return ['venice-uncensored'];
  }

  protected extraBodyParams(
    _options: ApiRequestOptions,
  ): Record<string, unknown> {
    return {
      venice_parameters: { include_venice_system_prompt: false },
    };
  }
}
