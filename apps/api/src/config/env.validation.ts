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
