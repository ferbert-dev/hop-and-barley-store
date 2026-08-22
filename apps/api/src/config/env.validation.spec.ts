import { validateEnvironment } from './env.validation';

const BASE = {
  AUTH_COOKIE_MODE: 'local-http',
  AUTH_ORIGIN: 'http://localhost:3000',
  AUTH_SESSIONS_ENABLED: false,
  CART_COOKIE_MODE: 'local-http',
  CART_CSRF_KEYRING: `cart-v1:${'22'.repeat(32)}`,
  CART_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
};

describe('auth environment validation', () => {
  it('requires an explicit cookie mode instead of inferring from NODE_ENV', () => {
    expect(() =>
      validateEnvironment({ ...BASE, AUTH_COOKIE_MODE: undefined }),
    ).toThrow(/AUTH_COOKIE_MODE/);
  });

  it('validates cart cookie mode, exact Origin, CORS and unique CSRF versions', () => {
    expect(() =>
      validateEnvironment({ ...BASE, CART_COOKIE_MODE: undefined }),
    ).toThrow(/CART_COOKIE_MODE/);
    expect(() =>
      validateEnvironment({
        ...BASE,
        CART_COOKIE_MODE: 'secure-https',
        CART_ORIGIN: 'http://shop.example.com',
      }),
    ).toThrow(/CART_ORIGIN/);
    expect(() =>
      validateEnvironment({
        ...BASE,
        CART_CSRF_KEYRING: `v1:${'11'.repeat(32)},v1:${'22'.repeat(32)}`,
      }),
    ).toThrow(/versions must be unique/);
    expect(() =>
      validateEnvironment({
        ...BASE,
        CORS_ORIGINS: 'https://shop.example.com',
      }),
    ).toThrow(/CORS_ORIGINS/);
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
