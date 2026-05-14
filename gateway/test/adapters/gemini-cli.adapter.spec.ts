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
      defaultModel: 'gemini-3.1-pro-preview',
    });
    const invocation = adapter.buildCommand({ prompt: 'hi' });

    expect(invocation.args).toEqual([
      '--skip-trust',
      '-p',
      'hi',
      '-m',
      'gemini-3.1-pro-preview',
    ]);
  });

  it('allows per-call model override', () => {
    const adapter = new GeminiCliAdapter({
      binPath: 'gemini',
      defaultModel: 'gemini-3.1-pro-preview',
    });
    const invocation = adapter.buildCommand({
      prompt: 'hi',
      model: 'gemini-3-flash-preview',
    });

    expect(invocation.args).toEqual([
      '--skip-trust',
      '-p',
      'hi',
      '-m',
      'gemini-3-flash-preview',
    ]);
  });

  it('falls back to the built-in default model when neither config nor call sets one', () => {
    const adapter = new GeminiCliAdapter({ binPath: 'gemini', defaultModel: undefined });
    const invocation = adapter.buildCommand({ prompt: 'hi' });
    // args = [--skip-trust, -p, hi, -m, <model>]
    expect(invocation.args[4]).toBe('gemini-3-flash-preview');
  });

  it('always emits --skip-trust to satisfy the CLI 0.42+ trusted-folders gate', () => {
    const adapter = new GeminiCliAdapter();
    const invocation = adapter.buildCommand({
      prompt: 'hi',
      model: 'gemini-2.5-flash',
    });
    expect(invocation.args[0]).toBe('--skip-trust');
  });
});
