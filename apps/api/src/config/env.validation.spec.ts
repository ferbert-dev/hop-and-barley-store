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

  it('accepts exact dual-loopback allowlists only when CORS covers every flow', () => {
    const dualOrigins = 'http://localhost:3000,http://127.0.0.1:3000';
    expect(
      validateEnvironment({
        ...BASE,
        AUTH_ORIGIN: dualOrigins,
        CART_ORIGIN: dualOrigins,
        CORS_ORIGINS: dualOrigins,
        REGISTRATION_ORIGIN: dualOrigins,
      }),
    ).toMatchObject({
      AUTH_ORIGIN: dualOrigins,
      CART_ORIGIN: dualOrigins,
      CORS_ORIGINS: dualOrigins,
      REGISTRATION_ORIGIN: dualOrigins,
    });
    expect(() =>
      validateEnvironment({
        ...BASE,
        AUTH_ORIGIN: dualOrigins,
        CART_ORIGIN: dualOrigins,
        CORS_ORIGINS: 'http://localhost:3000',
        REGISTRATION_ORIGIN: dualOrigins,
      }),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('rejects duplicate or non-exact origins in an allowlist', () => {
    expect(() =>
      validateEnvironment({
        ...BASE,
        AUTH_ORIGIN: 'http://localhost:3000,http://localhost:3000',
      }),
    ).toThrow(/AUTH_ORIGIN/);
    expect(() =>
      validateEnvironment({
        ...BASE,
        REGISTRATION_ORIGIN: 'http://localhost:3000/',
      }),
    ).toThrow(/REGISTRATION_ORIGIN/);
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

  it('defaults and validates the provider-neutral product asset storage root', () => {
    expect(validateEnvironment(BASE)).toMatchObject({
      PRODUCT_ASSET_STORAGE_PATH: '.local/product-assets',
    });
    expect(
      validateEnvironment({
        ...BASE,
        PRODUCT_ASSET_STORAGE_PATH: '  /srv/hop-and-barley/product-assets  ',
      }),
    ).toMatchObject({
      PRODUCT_ASSET_STORAGE_PATH: '/srv/hop-and-barley/product-assets',
    });
    expect(() =>
      validateEnvironment({ ...BASE, PRODUCT_ASSET_STORAGE_PATH: '/' }),
    ).toThrow(/PRODUCT_ASSET_STORAGE_PATH/);
    expect(() =>
      validateEnvironment({
        ...BASE,
        PRODUCT_ASSET_STORAGE_PATH: 'assets\0escape',
      }),
    ).toThrow(/PRODUCT_ASSET_STORAGE_PATH/);
  });

  it('fails closed unless the complete test-only Stripe contract is configured', () => {
    expect(() =>
      validateEnvironment({ ...BASE, STRIPE_PAYMENTS_ENABLED: true }),
    ).toThrow(/Stripe Sandbox configuration is incomplete/);
    expect(() =>
      validateEnvironment({
        ...BASE,
        STRIPE_PAYMENTS_ENABLED: true,
        STRIPE_SANDBOX_SECRET_KEY: 'sk_live_1234567890123456',
      }),
    ).toThrow(/STRIPE_SANDBOX_SECRET_KEY/);

    expect(
      validateEnvironment({
        ...BASE,
        STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:3000/checkout/cancel',
        STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:3000/checkout/success',
        STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: 'pmc_cardonly123',
        STRIPE_PAYMENTS_ENABLED: true,
        STRIPE_SANDBOX_SECRET_KEY: 'sk_test_1234567890123456',
        STRIPE_SANDBOX_WEBHOOK_SECRET: 'whsec_1234567890123456',
      }),
    ).toMatchObject({ STRIPE_PAYMENTS_ENABLED: true });

    expect(() =>
      validateEnvironment({
        ...BASE,
        STRIPE_CHECKOUT_CANCEL_URL: 'https://shop.example.test/cancel',
        STRIPE_CHECKOUT_SUCCESS_URL: 'https://shop.example.test/success',
        STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: 'pmc_cardonly123',
        STRIPE_PAYMENTS_ENABLED: true,
        STRIPE_SANDBOX_SECRET_KEY: 'sk_test_1234567890123456',
        STRIPE_SANDBOX_WEBHOOK_SECRET: 'whsec_1234567890123456',
      }),
    ).toThrow(/return origins must be included in CORS_ORIGINS/);
  });
});
