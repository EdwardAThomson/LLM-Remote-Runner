import { GeminiCliAdapter } from '../../src/adapters';

describe('GeminiCliAdapter', () => {
  it('reports backend metadata', () => {
    const adapter = new GeminiCliAdapter();
    expect(adapter.backend).toBe('gemini-cli');
    expect(adapter.displayName).toContain('Gemini');
  });

  it('uses the configured default model when none is provided per-call', () => {
    const adapter = new GeminiCliAdapter({
      binPath: 'gemini',
      defaultModel: 'gemini-2.5-pro',
    });
    const invocation = adapter.buildCommand({ prompt: 'hi' });

    expect(invocation.args).toEqual(['-p', 'hi', '-m', 'gemini-2.5-pro']);
  });

  it('allows per-call model override', () => {
    const adapter = new GeminiCliAdapter({
      binPath: 'gemini',
      defaultModel: 'gemini-2.5-pro',
    });
    const invocation = adapter.buildCommand({
      prompt: 'hi',
      model: 'gemini-2.5-flash',
    });

    expect(invocation.args).toEqual(['-p', 'hi', '-m', 'gemini-2.5-flash']);
  });

  it('falls back to the built-in default model when neither config nor call sets one', () => {
    const adapter = new GeminiCliAdapter({ binPath: 'gemini', defaultModel: undefined });
    const invocation = adapter.buildCommand({ prompt: 'hi' });
    expect(invocation.args[3]).toBe('gemini-2.5-pro');
  });
});
