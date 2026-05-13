import { ClaudeCliAdapter } from '../../src/adapters';

describe('ClaudeCliAdapter', () => {
  it('reports backend metadata', () => {
    const adapter = new ClaudeCliAdapter();
    expect(adapter.backend).toBe('claude-cli');
    expect(adapter.displayName).toContain('Claude');
  });

  it('builds a -p invocation with --output-format json', () => {
    const adapter = new ClaudeCliAdapter({ binPath: '/opt/claude' });
    const invocation = adapter.buildCommand({
      prompt: 'do something',
      cwd: '/workspace',
    });

    expect(invocation.command).toBe('/opt/claude');
    expect(invocation.args).toEqual([
      '-p',
      'do something',
      '--output-format',
      'json',
    ]);
  });

  describe('parseOutput', () => {
    const adapter = new ClaudeCliAdapter();

    it('extracts result from valid JSON output', () => {
      const stdout = JSON.stringify({ result: 'hello world' });
      expect(adapter.parseOutput(stdout)).toEqual({
        content: 'hello world',
        success: true,
      });
    });

    it('stringifies non-string result values', () => {
      const stdout = JSON.stringify({ result: 42 });
      expect(adapter.parseOutput(stdout)).toEqual({
        content: '42',
        success: true,
      });
    });

    it('returns raw output when JSON lacks a result field', () => {
      const stdout = JSON.stringify({ foo: 'bar' });
      expect(adapter.parseOutput(stdout)).toEqual({
        content: stdout,
        success: true,
      });
    });

    it('returns raw output when JSON parsing fails', () => {
      const stdout = 'not json at all';
      expect(adapter.parseOutput(stdout)).toEqual({
        content: 'not json at all',
        success: true,
      });
    });

    it('flags empty output as failure', () => {
      const result = adapter.parseOutput('   \n  ');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/empty/i);
    });
  });
});
