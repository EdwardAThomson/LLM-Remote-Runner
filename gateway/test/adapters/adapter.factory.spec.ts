import { ConfigService } from '@nestjs/config';
import {
  AdapterFactory,
  ClaudeCliAdapter,
  CodexAdapter,
  GeminiCliAdapter,
} from '../../src/adapters';

function configWith(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue,
  } as unknown as ConfigService;
}

describe('AdapterFactory', () => {
  it('initializes all three CLI adapters from config', () => {
    const factory = new AdapterFactory(
      configWith({
        'app.codexBinPath': '/usr/local/bin/codex',
        'app.claudeBinPath': '/usr/local/bin/claude',
        'app.geminiBinPath': '/usr/local/bin/gemini',
        'app.geminiDefaultModel': 'gemini-2.5-flash',
      }),
    );

    expect(factory.getAdapter('codex')).toBeInstanceOf(CodexAdapter);
    expect(factory.getAdapter('claude-cli')).toBeInstanceOf(ClaudeCliAdapter);
    expect(factory.getAdapter('gemini-cli')).toBeInstanceOf(GeminiCliAdapter);

    expect(factory.getAdapter('codex').getBinPath()).toBe('/usr/local/bin/codex');
    expect(factory.getAdapter('claude-cli').getBinPath()).toBe('/usr/local/bin/claude');
    expect(factory.getAdapter('gemini-cli').getBinPath()).toBe('/usr/local/bin/gemini');
  });

  it('propagates the configured default Gemini model into the adapter', () => {
    const factory = new AdapterFactory(
      configWith({
        'app.codexBinPath': 'codex',
        'app.claudeBinPath': 'claude',
        'app.geminiBinPath': 'gemini',
        'app.geminiDefaultModel': 'gemini-2.5-flash',
      }),
    );

    const invocation = factory
      .getAdapter('gemini-cli')
      .buildCommand({ prompt: 'hi' });
    expect(invocation.args).toEqual(['-p', 'hi', '-m', 'gemini-2.5-flash']);
  });

  it('throws a descriptive error for unknown backends', () => {
    const factory = new AdapterFactory(configWith({}));
    expect(() => factory.getAdapter('not-a-backend' as never)).toThrow(
      /Unsupported backend/,
    );
  });

  it('lists supported backends', () => {
    const factory = new AdapterFactory(configWith({}));
    expect(factory.getSupportedBackends().sort()).toEqual(
      ['claude-cli', 'codex', 'gemini-cli'].sort(),
    );
  });
});
