import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ProductAssetStorageService } from './product-asset-storage.service';

@ApiTags('product-assets')
@Public()
@Controller('product-assets')
export class ProductAssetsController {
  constructor(private readonly assets: ProductAssetStorageService) {}

  @Get(':key')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('Content-Type', 'image/webp')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Read an immutable uploaded product image' })
  @ApiProduces('image/webp')
  @ApiOkResponse({
    description: 'WebP product image',
    schema: { format: 'binary', type: 'string' },
  })
  @ApiNotFoundResponse({ description: 'Product image not found' })
  @ApiServiceUnavailableResponse({ description: 'Asset storage unavailable' })
  @ApiParam({
    name: 'key',
    schema: {
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$',
      type: 'string',
    },
  })
  async read(@Param('key') key: string): Promise<StreamableFile> {
    const asset = await this.assets.readAsset(key);
    return new StreamableFile(asset, { type: 'image/webp' });
  }
}
