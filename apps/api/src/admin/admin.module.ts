import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminAuthorizationGuard } from './admin-authorization.guard';
import { AdminController } from './admin.controller';
import { AdminProductListService } from './admin-product-list.service';
import { AdminProductCreationService } from './admin-product-creation.service';
import { ProductAssetsModule } from '../product-assets/product-assets.module';

@Module({
  imports: [ProductAssetsModule],
  controllers: [AdminController],
  providers: [
    AdminProductCreationService,
    AdminProductListService,
    { provide: APP_GUARD, useClass: AdminAuthorizationGuard },
  ],
})
export class AdminModule {}
