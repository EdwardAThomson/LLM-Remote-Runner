import { OpenAiCompatibleApiAdapter } from './openai-compatible-api.adapter';

/**
 * Self-hosted / local API adapter.
 *
 * Targets any OpenAI-compatible server exposed on `/v1` (Ollama, llama.cpp,
 * vLLM, ...). The base URL is REQUIRED from config (built from
 * `HOSTED_LLM_URL`/`HOSTED_LLM_PORT`, or a full `HOSTED_LLM_BASE_URL`); the API
 * key is optional because local servers frequently need none. `isConfigured()`
 * is therefore overridden to treat a present base URL (not a key) as
 * "configured".
 */
export class HostedApiAdapter extends OpenAiCompatibleApiAdapter {
  readonly backend = 'hosted-api' as const;
  readonly displayName = 'Self-hosted';

  protected getDefaultBaseUrl(): string {
    // No public default: a self-hosted endpoint only exists when configured.
    return '';
  }

  /**
   * Local servers often require no key, so availability hinges on a base URL
   * rather than on `apiKey`.
   */
  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.length > 0);
  }

  getAvailableModels(): string[] {
    // Whatever HOSTED_LLM_MODEL names; empty when unset (model is then supplied
    // per request).
    return this.config.defaultModel ? [this.config.defaultModel] : [];
  }
}
