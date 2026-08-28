import { Module } from '@nestjs/common';
import { ProductAssetStorageService } from './product-asset-storage.service';
import { ProductAssetsController } from './product-assets.controller';

@Module({
  controllers: [ProductAssetsController],
  exports: [ProductAssetStorageService],
  providers: [ProductAssetStorageService],
})
export class ProductAssetsModule {}
