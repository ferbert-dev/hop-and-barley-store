import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiNotFoundResponse,
  ApiPayloadTooLargeResponse,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from './admin-only.decorator';
import { AdminCapabilitiesDto } from './dto/admin-capabilities.dto';
import {
  AdminCatalogQueryDto,
  CATALOG_SORT_VALUES,
} from '../catalog/dto/catalog-query.dto';
import { AdminProductListService } from './admin-product-list.service';
import { AdminProductListResponseDto } from './dto/admin-product-list.dto';
import { AdminProductCreationService } from './admin-product-creation.service';
import {
  AdminCreateProductBodyDto,
  AdminCreateProductMultipartDto,
  AdminCreatedProductDto,
  AdminProductCreateOptionsDto,
  AdminUpdateProductBodyDto,
  AdminUpdateProductMultipartDto,
} from './dto/admin-product-create.dto';
import {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
  type UploadedProductImage,
} from '../product-assets/product-asset-storage.service';

const productImageUploadOptions = {
  fileFilter: (
    _request: unknown,
    file: { mimetype: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (
      !PRODUCT_IMAGE_MIME_TYPES.includes(
        file.mimetype as (typeof PRODUCT_IMAGE_MIME_TYPES)[number],
      )
    ) {
      callback(
        new BadRequestException({ status: 'invalid-product-image' }),
        false,
      );
      return;
    }
    callback(null, true);
  },
  limits: {
    fieldNameSize: 100,
    fieldSize: 20_000,
    fields: 13,
    fileSize: PRODUCT_IMAGE_MAX_BYTES,
    files: 1,
    parts: 14,
  },
};

@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly products: AdminProductListService,
    private readonly productCreation: AdminProductCreationService,
  ) {}

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
    name: 'lifecycle',
    required: false,
    schema: {
      enum: ['ACTIVE', 'ENDING_SOON', 'DISABLED', 'SCHEDULED', 'EXPIRED'],
      type: 'string',
    },
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
    @Query() query: AdminCatalogQueryDto,
  ): Promise<AdminProductListResponseDto> {
    return this.products.listProducts(query);
  }

  @Get('products/create-options')
  @ApiOperation({ summary: 'Get the bounded product creation options' })
  @ApiOkResponse({ type: AdminProductCreateOptionsDto })
  createOptions(): AdminProductCreateOptionsDto {
    return this.productCreation.getCreateOptions();
  }

  @Post('products')
  @UseInterceptors(FileInterceptor('image', productImageUploadOptions))
  @ApiOperation({ summary: 'Create an administrator-managed product' })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AdminCreateProductMultipartDto })
  @ApiCreatedResponse({ type: AdminCreatedProductDto })
  @ApiBadRequestResponse({ description: 'Invalid product fields or image' })
  @ApiConflictResponse({ description: 'Generated product slug already exists' })
  @ApiPayloadTooLargeResponse({ description: 'Product image exceeds 5 MiB' })
  @ApiServiceUnavailableResponse({
    description:
      'Session verification, product storage or asset storage unavailable',
  })
  createProduct(
    @Body() body: AdminCreateProductBodyDto,
    @UploadedFile() image: UploadedProductImage | undefined,
  ): Promise<AdminCreatedProductDto> {
    if (!image) {
      throw new BadRequestException({ status: 'product-image-required' });
    }
    return this.productCreation.createProduct(body, image);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get one administrator-managed product' })
  @ApiOkResponse({ type: AdminCreatedProductDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getProduct(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AdminCreatedProductDto> {
    return this.productCreation.getProduct(id);
  }

  @Patch('products/:id')
  @UseInterceptors(FileInterceptor('image', productImageUploadOptions))
  @ApiOperation({ summary: 'Update an administrator-managed product' })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    schema: { type: 'string' },
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AdminUpdateProductMultipartDto })
  @ApiOkResponse({ type: AdminCreatedProductDto })
  @ApiBadRequestResponse({ description: 'Invalid product fields or image' })
  @ApiConflictResponse({
    description: 'Product was changed by another request',
  })
  @ApiNotFoundResponse({ description: 'Product not found' })
  updateProduct(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: AdminUpdateProductBodyDto,
    @UploadedFile() image: UploadedProductImage | undefined,
  ): Promise<AdminCreatedProductDto> {
    return this.productCreation.updateProduct(id, body, image);
  }
}
