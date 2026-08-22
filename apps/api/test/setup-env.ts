process.env.DATABASE_URL ??=
  'postgresql://hopbarley:hopbarley@localhost:5432/hopbarley?schema=public';
process.env.NODE_ENV = 'test';
process.env.REGISTRATION_ENABLED ??= 'true';
process.env.REGISTRATION_ORIGIN ??= 'http://localhost:3000';
