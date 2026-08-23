import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function configureCiBrowserEnvironment({
  appendEnvironment = appendFileSync,
  githubEnvironmentPath = process.env.GITHUB_ENV,
  randomBytesForCi = randomBytes,
  writeMask = (value) => process.stdout.write(`::add-mask::${value}\n`),
} = {}) {
  if (!githubEnvironmentPath) {
    throw new Error('GITHUB_ENV is required for the browser CI setup');
  }

  const authKeyring = `ci-v1:${randomBytesForCi(32).toString('hex')}`;
  const cartKeyring = `ci-v1:${randomBytesForCi(32).toString('hex')}`;
  const databasePassword = randomBytesForCi(24).toString('hex');

  for (const value of [authKeyring, cartKeyring, databasePassword]) {
    writeMask(value);
  }

  const settings = {
    POSTGRES_PASSWORD: databasePassword,
    API_DATABASE_URL: `postgresql://hopbarley:${databasePassword}@postgres:5432/hopbarley?schema=public`,
    AUTH_SESSIONS_ENABLED: 'true',
    AUTH_CSRF_KEYRING: authKeyring,
    CART_CSRF_KEYRING: cartKeyring,
    CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    AUTH_ORIGIN: 'http://localhost:3000,http://127.0.0.1:3000',
    CART_ORIGIN: 'http://localhost:3000,http://127.0.0.1:3000',
    REGISTRATION_ORIGIN: 'http://localhost:3000,http://127.0.0.1:3000',
    API_INTERNAL_URL: 'http://api:3001/api/v1',
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
    NEXT_PUBLIC_API_HOST_ALIASES: 'localhost,127.0.0.1',
  };

  appendEnvironment(
    githubEnvironmentPath,
    `${Object.entries(settings)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );

  return settings;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  configureCiBrowserEnvironment();
}
