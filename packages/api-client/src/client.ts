import createClient, { type ClientOptions } from 'openapi-fetch';

import type { paths } from './generated/schema.js';

export type ApiClientOptions = Omit<ClientOptions, 'baseUrl'>;

export function createApiClient(
  baseUrl: string,
  options: ApiClientOptions = {},
) {
  return createClient<paths>({ ...options, baseUrl });
}
