import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PasswordHashExecutor } from './password/password-hash-executor';
import { RegistrationRateLimiter } from './registration-rate-limiter';
import { RegistrationRequestGuard } from './registration-request.guard';
import { RegistrationService } from './registration.service';

@Module({
  controllers: [AuthController],
  providers: [
    PasswordHashExecutor,
    RegistrationRateLimiter,
    RegistrationRequestGuard,
    RegistrationService,
  ],
})
export class AuthModule {}
