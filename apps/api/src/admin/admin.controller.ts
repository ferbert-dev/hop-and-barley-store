import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from './admin-only.decorator';
import { AdminCapabilitiesDto } from './dto/admin-capabilities.dto';
import {
  CatalogQueryDto,
  CATALOG_SORT_VALUES,
} from '../catalog/dto/catalog-query.dto';
import { AdminProductListService } from './admin-product-list.service';
import { AdminProductListResponseDto } from './dto/admin-product-list.dto';

@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly products: AdminProductListService) {}

  @Get('capabilities')
  @ApiOperation({
    summary: 'Resolve the current administrator shell capability',
  })
  @ApiOkResponse({ type: AdminCapabilitiesDto })
  capabilities(): AdminCapabilitiesDto {
    return { productManagement: true };
  }

  @Get('products')
  @ApiOperation({ summary: 'List products for administrator management' })
  @ApiOkResponse({ type: AdminProductListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid catalog query parameters' })
  @ApiQuery({
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
  listProducts(
    @Query() query: CatalogQueryDto,
  ): Promise<AdminProductListResponseDto> {
    return this.products.listProducts(query);
  }
}
