import {
  BASE_ENV_ALLOWLIST,
  buildSubprocessEnv,
} from '../../src/tasks/subprocess-env';

describe('buildSubprocessEnv', () => {
  const source: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/test',
    USER: 'test',
    LANG: 'en_US.UTF-8',
    JWT_SECRET: 'super-secret-jwt',
    ADMIN_PASSWORD_HASH: '$2b$10$abcdef',
    OPENAI_API_KEY: 'sk-openai-secret',
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    GEMINI_API_KEY: 'gemini-secret',
    DATABASE_URL: 'postgres://...',
    CUSTOM_FLAG: 'custom-value',
  };

  it('forwards only base-allowlisted variables by default', () => {
    const env = buildSubprocessEnv({ source });

    expect(env.PATH).toBe('/usr/bin:/bin');
    expect(env.HOME).toBe('/home/test');
    expect(env.USER).toBe('test');
    expect(env.LANG).toBe('en_US.UTF-8');
  });

  it('strips JWT_SECRET, ADMIN_PASSWORD_HASH, and unused API keys', () => {
    const env = buildSubprocessEnv({ source });

    expect(env).not.toHaveProperty('JWT_SECRET');
    expect(env).not.toHaveProperty('ADMIN_PASSWORD_HASH');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('GEMINI_API_KEY');
    expect(env).not.toHaveProperty('DATABASE_URL');
  });

  it('forwards EXTRA_SUBPROCESS_ENV opt-ins', () => {
    const env = buildSubprocessEnv({ source, extra: ['CUSTOM_FLAG'] });
    expect(env.CUSTOM_FLAG).toBe('custom-value');
  });

  it('still strips secrets when extra is set but does not name them', () => {
    const env = buildSubprocessEnv({ source, extra: ['CUSTOM_FLAG'] });
    expect(env).not.toHaveProperty('JWT_SECRET');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
  });

  it('allows adapter-supplied env to override the source', () => {
    const env = buildSubprocessEnv({
      source,
      adapterEnv: { ANTHROPIC_API_KEY: 'adapter-supplied-key' },
    });
    expect(env.ANTHROPIC_API_KEY).toBe('adapter-supplied-key');
  });

  it('skips source entries that are undefined', () => {
    const env = buildSubprocessEnv({
      source: { PATH: '/usr/bin', HOME: undefined },
    });
    expect(env.PATH).toBe('/usr/bin');
    expect(env).not.toHaveProperty('HOME');
  });

  it('skips adapter env entries with undefined values', () => {
    const env = buildSubprocessEnv({
      source,
      adapterEnv: { SOMETHING: undefined },
    });
    expect(env).not.toHaveProperty('SOMETHING');
  });

  it('forwards proxy variables under both casings if present', () => {
    const env = buildSubprocessEnv({
      source: {
        HTTPS_PROXY: 'http://proxy:8080',
        http_proxy: 'http://lowercase:8080',
      },
    });
    expect(env.HTTPS_PROXY).toBe('http://proxy:8080');
    expect(env.http_proxy).toBe('http://lowercase:8080');
  });

  it('exposes the base allowlist for reference', () => {
    expect(BASE_ENV_ALLOWLIST).toEqual(expect.arrayContaining(['PATH', 'HOME']));
    expect(BASE_ENV_ALLOWLIST).not.toEqual(expect.arrayContaining(['JWT_SECRET']));
  });
});
