import {
  BadRequestException,
  Injectable,
  ValidationPipe,
  type ArgumentMetadata,
  type INestApplication,
  type PipeTransform,
} from '@nestjs/common';
import {
  AdminCatalogQueryDto,
  CatalogQueryDto,
} from './catalog/dto/catalog-query.dto';

const CATALOG_QUERY_KEYS = new Set([
  'category',
  'limit',
  'lifecycle',
  'maxPriceMinor',
  'minPriceMinor',
  'page',
  'search',
  'sort',
]);

@Injectable()
export class CatalogQueryKeysPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (
      metadata.type !== 'query' ||
      (metadata.metatype !== CatalogQueryDto &&
        metadata.metatype !== AdminCatalogQueryDto) ||
      value === null ||
      typeof value !== 'object'
    ) {
      return value;
    }

    const unknownKeys = Object.getOwnPropertyNames(value).filter(
      (key) => !CATALOG_QUERY_KEYS.has(key),
    );
    if (unknownKeys.length > 0) {
      throw new BadRequestException('Unknown catalog query parameter.');
    }

    return value;
  }
}

export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  });
}

export function configureAppValidation(app: INestApplication): void {
  app.useGlobalPipes(new CatalogQueryKeysPipe(), createAppValidationPipe());
}
