import { OpenAiCompatibleApiAdapter } from './openai-compatible-api.adapter';

/**
 * OpenAI API adapter
 */
export class OpenAiApiAdapter extends OpenAiCompatibleApiAdapter {
  readonly backend = 'openai-api' as const;
  readonly displayName = 'OpenAI API';

  protected getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  getAvailableModels(): string[] {
    return ['gpt-5.5', 'gpt-5.4', 'gpt-5.2'];
  }
}
