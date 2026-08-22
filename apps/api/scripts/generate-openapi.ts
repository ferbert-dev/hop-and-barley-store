import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { configureAppRouting } from '../src/app-routing';
import { configureOpenApi } from '../src/openapi';

process.env.DATABASE_URL ??=
  'postgresql://hopbarley:hopbarley@localhost:5432/hopbarley?schema=public';
process.env.AUTH_COOKIE_MODE ??= 'local-http';
process.env.AUTH_ORIGIN ??= 'http://localhost:3000';
process.env.AUTH_SESSIONS_ENABLED ??= 'false';
process.env.CART_COOKIE_MODE ??= 'local-http';
process.env.CART_CSRF_KEYRING ??= `openapi-v1:${'22'.repeat(32)}`;
process.env.CART_ORIGIN ??= 'http://localhost:3000';

async function generateOpenApi() {
  const { AppModule } = await import('../src/app.module.js');
  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: false,
  });
  configureAppRouting(app);
  const document = configureOpenApi(app);

  await writeFile(
    resolve(__dirname, '..', 'openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
  await app.close();
}

void generateOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
