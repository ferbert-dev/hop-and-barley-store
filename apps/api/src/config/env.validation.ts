import Joi from 'joi';

const schema = Joi.object({
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
    .custom((value: string, helpers) => {
      try {
        const parsed = new URL(value);
        if (parsed.origin !== value || parsed.username || parsed.password) {
          return helpers.error('any.invalid');
        }
        return parsed.origin;
      } catch {
        return helpers.error('any.invalid');
      }
    })
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

  return validation.value as Record<string, unknown>;
}
