import { RequestMethod, type INestApplication } from '@nestjs/common';

export const API_GLOBAL_PREFIX = 'api/v1';

export function configureAppRouting(app: INestApplication): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });
}
