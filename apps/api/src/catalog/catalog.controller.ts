import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CATALOG_SORT_VALUES, CatalogQueryDto } from './dto/catalog-query.dto';
import { CatalogResponseDto } from './dto/catalog-response.dto';
import { ProductDetailDto } from './dto/product-detail.dto';
import { ProductSlugDto } from './dto/product-slug.dto';
import { Public } from '../auth/public.decorator';

@ApiTags('catalog')
@Controller('products')
@Public()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOkResponse({ type: CatalogResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid catalog query parameters' })
  @ApiQuery({
    description:
      'Unicode NFC search; control characters and literal backslash, percent and underscore are forbidden.',
    maxLength: 80,
    minLength: 2,
    name: 'search',
    required: false,
    type: String,
  })
  @ApiQuery({
    maxLength: 64,
    name: 'category',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    required: false,
    type: String,
  })
  @ApiQuery({
    format: 'int32',
    maximum: 2_147_483_647,
    minimum: 0,
    name: 'minPriceMinor',
    required: false,
    type: 'integer',
  })
  @ApiQuery({
    format: 'int32',
    maximum: 2_147_483_647,
    minimum: 0,
    name: 'maxPriceMinor',
    required: false,
    type: 'integer',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    schema: {
      default: 'name-asc',
      enum: [...CATALOG_SORT_VALUES],
      type: 'string',
    },
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: {
      default: 1,
      format: 'int32',
      maximum: 200,
      minimum: 1,
      type: 'integer',
    },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: {
      default: 12,
      format: 'int32',
      maximum: 48,
      minimum: 1,
      type: 'integer',
    },
  })
  listProducts(@Query() query: CatalogQueryDto): Promise<CatalogResponseDto> {
    return this.catalog.listProducts(query);
  }

  @Get(':slug')
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiBadRequestResponse({ description: 'Invalid product slug' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiParam({
    name: 'slug',
    schema: {
      maxLength: 64,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      type: 'string',
    },
  })
  getProduct(@Param() { slug }: ProductSlugDto): Promise<ProductDetailDto> {
    return this.catalog.getProduct(slug);
  }
}
