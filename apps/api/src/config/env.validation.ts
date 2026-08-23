import Joi from 'joi';
import { splitOriginList } from './origin-list';

const schema = Joi.object({
  AUTH_COOKIE_MODE: Joi.string().valid('local-http', 'secure-https').required(),
  AUTH_CSRF_KEYRING: Joi.string()
    .empty('')
    .pattern(
      /^[A-Za-z0-9_-]{1,16}:[a-f0-9]{64}(?:,[A-Za-z0-9_-]{1,16}:[a-f0-9]{64}){0,2}$/,
    )
    .optional(),
  AUTH_ORIGIN: Joi.string().custom(validateExactOriginList).required(),
  AUTH_SESSIONS_ENABLED: Joi.boolean().default(false),
  CART_COOKIE_MODE: Joi.string().valid('local-http', 'secure-https').required(),
  CART_CSRF_KEYRING: Joi.string()
    .pattern(
      /^[A-Za-z0-9_-]{1,16}:[a-f0-9]{64}(?:,[A-Za-z0-9_-]{1,16}:[a-f0-9]{64}){0,2}$/,
    )
    .required(),
  CART_ORIGIN: Joi.string().custom(validateExactOriginList).required(),
  CORS_ORIGINS: Joi.string()
    .custom(validateExactOriginList)
    .default('http://localhost:3000'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  REGISTRATION_ENABLED: Joi.boolean().default(false),
  REGISTRATION_ORIGIN: Joi.string()
    .custom(validateExactOriginList)
    .default('http://localhost:3000'),
}).unknown(true);

export function validateEnvironment(config: Record<string, unknown>) {
  const validation = schema.validate(config, {
    abortEarly: false,
  });

  if (validation.error) {
    throw new Error(
      `Environment validation failed: ${validation.error.message}`,
    );
  }

  const value = validation.value as Record<string, unknown>;
  const cookieMode = value.AUTH_COOKIE_MODE;
  const authOrigins = splitOriginList(value.AUTH_ORIGIN as string);
  if (authOrigins.some((origin) => !originMatchesMode(origin, cookieMode))) {
    throw new Error(
      'Environment validation failed: AUTH_ORIGIN is incompatible with AUTH_COOKIE_MODE',
    );
  }

  const cartCookieMode = value.CART_COOKIE_MODE;
  const cartOrigins = splitOriginList(value.CART_ORIGIN as string);
  if (
    cartOrigins.some((origin) => !originMatchesMode(origin, cartCookieMode))
  ) {
    throw new Error(
      'Environment validation failed: CART_ORIGIN is incompatible with CART_COOKIE_MODE',
    );
  }

  if (value.AUTH_SESSIONS_ENABLED && !value.AUTH_CSRF_KEYRING) {
    throw new Error(
      'Environment validation failed: AUTH_CSRF_KEYRING is required when AUTH_SESSIONS_ENABLED=true',
    );
  }

  if (value.AUTH_CSRF_KEYRING) {
    const versions = (value.AUTH_CSRF_KEYRING as string)
      .split(',')
      .map((entry) => entry.split(':', 1)[0]);
    if (new Set(versions).size !== versions.length) {
      throw new Error(
        'Environment validation failed: AUTH_CSRF_KEYRING versions must be unique',
      );
    }
  }

  const cartVersions = (value.CART_CSRF_KEYRING as string)
    .split(',')
    .map((entry) => entry.split(':', 1)[0]);
  if (new Set(cartVersions).size !== cartVersions.length) {
    throw new Error(
      'Environment validation failed: CART_CSRF_KEYRING versions must be unique',
    );
  }

  const corsOrigins = new Set(splitOriginList(value.CORS_ORIGINS as string));
  const requiredOrigins = [
    ...authOrigins,
    ...cartOrigins,
    ...splitOriginList(value.REGISTRATION_ORIGIN as string),
  ];
  if (requiredOrigins.some((origin) => !corsOrigins.has(origin))) {
    throw new Error(
      'Environment validation failed: CORS_ORIGINS must include every AUTH_ORIGIN, CART_ORIGIN and REGISTRATION_ORIGIN',
    );
  }

  return value;
}

function validateExactOriginList(value: string, helpers: Joi.CustomHelpers) {
  const origins = splitOriginList(value);
  if (
    origins.length === 0 ||
    origins.some((origin) => origin.length === 0) ||
    new Set(origins).size !== origins.length
  ) {
    return helpers.error('any.invalid');
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || parsed.username || parsed.password) {
        return helpers.error('any.invalid');
      }
    } catch {
      return helpers.error('any.invalid');
    }
  }
  return origins.join(',');
}

function originMatchesMode(origin: string, mode: unknown): boolean {
  const parsed = new URL(origin);
  return mode === 'secure-https'
    ? parsed.protocol === 'https:'
    : parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
}
