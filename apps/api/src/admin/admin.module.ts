import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminAuthorizationGuard } from './admin-authorization.guard';
import { AdminController } from './admin.controller';

@Module({
  controllers: [AdminController],
  providers: [{ provide: APP_GUARD, useClass: AdminAuthorizationGuard }],
})
export class AdminModule {}
