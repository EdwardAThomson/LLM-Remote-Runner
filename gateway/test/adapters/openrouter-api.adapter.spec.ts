import { ApiConfig, OpenRouterApiAdapter } from '../../src/adapters';

function config(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiKey: 'sk-or-test',
    defaultModel: 'deepseek/deepseek-chat',
    ...overrides,
  };
}

describe('OpenRouterApiAdapter', () => {
  it('reports backend metadata', () => {
    const adapter = new OpenRouterApiAdapter(config());
    expect(adapter.backend).toBe('openrouter-api');
    expect(adapter.displayName).toBe('OpenRouter');
  });

  it('is configured when an API key is present', () => {
    expect(new OpenRouterApiAdapter(config()).isConfigured()).toBe(true);
    expect(
      new OpenRouterApiAdapter(config({ apiKey: '' })).isConfigured(),
    ).toBe(false);
  });

  it('exposes the convenience model set and a default', () => {
    const adapter = new OpenRouterApiAdapter(config());
    const models = adapter.getAvailableModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain('deepseek/deepseek-chat');
    expect(adapter.getDefaultModel()).toBe('deepseek/deepseek-chat');
  });

  it('POSTs to the OpenRouter base URL', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
          model: 'deepseek/deepseek-chat',
          usage: {},
        }),
      } as never);

    try {
      await new OpenRouterApiAdapter(config()).complete({ prompt: 'yo' });
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
