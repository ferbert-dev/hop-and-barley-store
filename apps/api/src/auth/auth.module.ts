import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthOriginService } from './auth-origin.service';
import { AuthPrivateHeadersMiddleware } from './auth-private-headers.middleware';
import { LoginRateLimiter } from './login-rate-limiter';
import { LoginRequestGuard } from './login-request.guard';
import { LoginService } from './login.service';
import { PasswordHashExecutor } from './password/password-hash-executor';
import { RegistrationRateLimiter } from './registration-rate-limiter';
import { RegistrationRequestGuard } from './registration-request.guard';
import { RegistrationService } from './registration.service';
import { RegistrationZodPipe } from './dto/registration-zod.pipe';
import { SessionAuthGuard } from './session/session-auth.guard';
import { SessionModule } from './session/session.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [CartModule, SessionModule],
  controllers: [AuthController],
  providers: [
    PasswordHashExecutor,
    AuthOriginService,
    AuthPrivateHeadersMiddleware,
    LoginRateLimiter,
    LoginRequestGuard,
    LoginService,
    RegistrationRateLimiter,
    RegistrationRequestGuard,
    RegistrationService,
    RegistrationZodPipe,
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthPrivateHeadersMiddleware).forRoutes(AuthController);
  }
}
