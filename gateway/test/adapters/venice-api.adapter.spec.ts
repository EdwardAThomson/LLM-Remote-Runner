import { ApiConfig, VeniceApiAdapter } from '../../src/adapters';

function config(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiKey: 'venice-test',
    defaultModel: 'venice-uncensored',
    ...overrides,
  };
}

describe('VeniceApiAdapter', () => {
  it('reports backend metadata', () => {
    const adapter = new VeniceApiAdapter(config());
    expect(adapter.backend).toBe('venice-api');
    expect(adapter.displayName).toBe('Venice');
  });

  it('is configured when an API key is present', () => {
    expect(new VeniceApiAdapter(config()).isConfigured()).toBe(true);
    expect(new VeniceApiAdapter(config({ apiKey: '' })).isConfigured()).toBe(
      false,
    );
  });

  it('exposes a non-empty model list and a default', () => {
    const adapter = new VeniceApiAdapter(config());
    expect(adapter.getAvailableModels()).toContain('venice-uncensored');
    expect(adapter.getDefaultModel()).toBe('venice-uncensored');
  });

  it('injects venice_parameters into the request body and targets Venice', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
          model: 'venice-uncensored',
          usage: {},
        }),
      } as never);

    try {
      await new VeniceApiAdapter(config()).complete({ prompt: 'yo' });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.venice.ai/api/v1/chat/completions');

      const body = JSON.parse(init.body as string);
      expect(body.venice_parameters).toEqual({
        include_venice_system_prompt: false,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
