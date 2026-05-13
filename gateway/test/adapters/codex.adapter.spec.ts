import { CodexAdapter, DEFAULT_CODEX_CONFIG } from '../../src/adapters';

describe('CodexAdapter', () => {
  it('reports backend metadata', () => {
    const adapter = new CodexAdapter();
    expect(adapter.backend).toBe('codex');
    expect(adapter.displayName).toContain('Codex');
    expect(adapter.getBinPath()).toBe(DEFAULT_CODEX_CONFIG.binPath);
  });

  it('builds an exec --full-auto invocation with -C cwd', () => {
    const adapter = new CodexAdapter({ binPath: '/opt/codex' });
    const invocation = adapter.buildCommand({
      prompt: 'write hello world',
      cwd: '/workspace/project',
    });

    expect(invocation.command).toBe('/opt/codex');
    expect(invocation.args).toEqual([
      'exec',
      '--full-auto',
      '--skip-git-repo-check',
      '-C',
      '/workspace/project',
      'write hello world',
    ]);
  });

  it('omits -C when no cwd is provided', () => {
    const adapter = new CodexAdapter({ binPath: 'codex' });
    const invocation = adapter.buildCommand({ prompt: 'hi' });

    expect(invocation.args).toEqual([
      'exec',
      '--full-auto',
      '--skip-git-repo-check',
      'hi',
    ]);
  });

  it('passes prompt through argv (no shell interpolation)', () => {
    const adapter = new CodexAdapter();
    const tricky = 'echo `whoami`; rm -rf /';
    const invocation = adapter.buildCommand({ prompt: tricky });
    expect(invocation.args[invocation.args.length - 1]).toBe(tricky);
  });

  it('returns stdout unchanged from parseOutput by default', () => {
    const adapter = new CodexAdapter();
    const result = adapter.parseOutput('plain text output\n');
    expect(result).toEqual({ content: 'plain text output\n', success: true });
  });
});
