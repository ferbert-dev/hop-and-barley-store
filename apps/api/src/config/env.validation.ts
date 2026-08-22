import Joi from 'joi';

const schema = Joi.object({
  AUTH_COOKIE_MODE: Joi.string().valid('local-http', 'secure-https').required(),
  AUTH_CSRF_KEYRING: Joi.string()
    .empty('')
    .pattern(
      /^[A-Za-z0-9_-]{1,16}:[a-f0-9]{64}(?:,[A-Za-z0-9_-]{1,16}:[a-f0-9]{64}){0,2}$/,
    )
    .optional(),
  AUTH_ORIGIN: Joi.string().custom(validateExactOrigin).required(),
  AUTH_SESSIONS_ENABLED: Joi.boolean().default(false),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  REGISTRATION_ENABLED: Joi.boolean().default(false),
  REGISTRATION_ORIGIN: Joi.string()
    .custom(validateExactOrigin)
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
  const origin = new URL(value.AUTH_ORIGIN as string);
  const cookieMode = value.AUTH_COOKIE_MODE;
  if (
    (cookieMode === 'secure-https' && origin.protocol !== 'https:') ||
    (cookieMode === 'local-http' &&
      (origin.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', '::1'].includes(origin.hostname)))
  ) {
    throw new Error(
      'Environment validation failed: AUTH_ORIGIN is incompatible with AUTH_COOKIE_MODE',
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

  return value;
}

function validateExactOrigin(value: string, helpers: Joi.CustomHelpers) {
  try {
    const parsed = new URL(value);
    if (parsed.origin !== value || parsed.username || parsed.password) {
      return helpers.error('any.invalid');
    }
    return parsed.origin;
  } catch {
    return helpers.error('any.invalid');
  }
}
