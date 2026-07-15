import { ApiConfig, HostedApiAdapter } from '../../src/adapters';

function config(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiKey: '',
    defaultModel: '',
    baseUrl: 'http://localhost:11434/v1',
    ...overrides,
  };
}

describe('HostedApiAdapter', () => {
  it('reports backend metadata', () => {
    const adapter = new HostedApiAdapter(config());
    expect(adapter.backend).toBe('hosted-api');
    expect(adapter.displayName).toBe('Self-hosted');
  });

  it('is configured on a base URL alone (no key required)', () => {
    expect(new HostedApiAdapter(config()).isConfigured()).toBe(true);
    expect(
      new HostedApiAdapter(config({ apiKey: 'optional-key' })).isConfigured(),
    ).toBe(true);
  });

  it('is not configured without a base URL', () => {
    expect(new HostedApiAdapter(config({ baseUrl: undefined })).isConfigured()).toBe(
      false,
    );
  });

  it('lists the configured model, empty when unset', () => {
    expect(
      new HostedApiAdapter(config({ defaultModel: 'llama3.1' })).getAvailableModels(),
    ).toEqual(['llama3.1']);
    expect(new HostedApiAdapter(config()).getAvailableModels()).toEqual([]);
  });

  it('POSTs to the configured self-hosted base URL', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
          model: 'llama3.1',
          usage: {},
        }),
      } as never);

    try {
      await new HostedApiAdapter(config({ defaultModel: 'llama3.1' })).complete({
        prompt: 'yo',
      });
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/v1/chat/completions');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
