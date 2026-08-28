import { Module } from '@nestjs/common';
import { AdminAuthorizationGuard } from './admin-authorization.guard';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [AdminAuthorizationGuard],
})
export class AdminModule {}
