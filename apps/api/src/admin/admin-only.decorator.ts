import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ADMIN_ONLY_KEY,
  AdminAuthorizationGuard,
} from './admin-authorization.guard';

export function AdminOnly() {
  return applyDecorators(
    SetMetadata(ADMIN_ONLY_KEY, true),
    UseGuards(AdminAuthorizationGuard),
    ApiCookieAuth('sessionCookie'),
    ApiUnauthorizedResponse({ description: 'Session is not valid' }),
    ApiForbiddenResponse({ description: 'Administrator access is required' }),
    ApiServiceUnavailableResponse({
      description: 'Session verification is unavailable',
    }),
  );
}
