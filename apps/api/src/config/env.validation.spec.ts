import { validateEnvironment } from './env.validation';

const BASE = {
  AUTH_COOKIE_MODE: 'local-http',
  AUTH_ORIGIN: 'http://localhost:3000',
  AUTH_SESSIONS_ENABLED: false,
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
};

describe('auth environment validation', () => {
  it('requires an explicit cookie mode instead of inferring from NODE_ENV', () => {
    expect(() =>
      validateEnvironment({ ...BASE, AUTH_COOKIE_MODE: undefined }),
    ).toThrow(/AUTH_COOKIE_MODE/);
  });

  it('requires HTTPS origin for secure mode and loopback HTTP for local mode', () => {
    expect(() =>
      validateEnvironment({
        ...BASE,
        AUTH_COOKIE_MODE: 'secure-https',
        AUTH_ORIGIN: 'http://shop.example.com',
      }),
    ).toThrow(/AUTH_ORIGIN/);
    expect(() =>
      validateEnvironment({
        ...BASE,
        AUTH_ORIGIN: 'http://shop.example.com',
      }),
    ).toThrow(/AUTH_ORIGIN/);
  });

  it('requires a valid rotatable keyring only when sessions are enabled', () => {
    expect(
      validateEnvironment({ ...BASE, AUTH_CSRF_KEYRING: '' }),
    ).toMatchObject({ AUTH_SESSIONS_ENABLED: false });
    expect(() =>
      validateEnvironment({
        ...BASE,
        AUTH_CSRF_KEYRING: '',
        AUTH_SESSIONS_ENABLED: true,
      }),
    ).toThrow(/AUTH_CSRF_KEYRING/);
    expect(
      validateEnvironment({
        ...BASE,
        AUTH_CSRF_KEYRING: `v2:${'22'.repeat(32)},v1:${'11'.repeat(32)}`,
        AUTH_SESSIONS_ENABLED: true,
      }),
    ).toMatchObject({ AUTH_SESSIONS_ENABLED: true });
  });
});
