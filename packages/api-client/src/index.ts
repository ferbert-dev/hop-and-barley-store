export { createApiClient } from './client.js';
export type { ApiClientOptions } from './client.js';
export {
  CatalogResponseShapeError,
  normalizeCatalogResponse,
} from './catalog-compatibility.js';
export type {
  CatalogCompatibilityResult,
  LegacyCatalogProduct,
  PagedCatalogProduct,
  PagedCatalogResponse,
} from './catalog-compatibility.js';
export type { components, paths } from './generated/schema.js';
