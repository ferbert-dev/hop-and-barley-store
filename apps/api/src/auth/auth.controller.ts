import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthRequest } from './auth-request';
import { AuthSessionDto } from './dto/auth-session.dto';
import { CsrfResponseDto } from './dto/csrf-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginZodPipe } from './dto/login-zod.pipe';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { RegisterDto } from './dto/register.dto';
import { RegistrationZodPipe } from './dto/registration-zod.pipe';
import { RegistrationAcceptedDto } from './dto/registration-accepted.dto';
import { LoginRequestGuard } from './login-request.guard';
import { LoginService } from './login.service';
import { Public } from './public.decorator';
import {
  RegistrationRequestGuard,
  type RegistrationRequest,
} from './registration-request.guard';
import { RegistrationService } from './registration.service';
import { CsrfService } from './session/csrf.service';
import {
  clearSessionCookie,
  createSessionCookie,
  readSessionCookie,
  type AuthCookieMode,
} from './session/session-cookie';
import { SessionService, type ActiveSession } from './session/session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly loginService: LoginService,
    private readonly sessions: SessionService,
    private readonly csrf: CsrfService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Public()
  @HttpCode(202)
  @UseGuards(RegistrationRequestGuard)
  @ApiBody({ required: true, type: RegisterDto })
  @ApiAcceptedResponse({ type: RegistrationAcceptedDto })
  @ApiBadRequestResponse({ description: 'Invalid registration input' })
  @ApiForbiddenResponse({ description: 'Origin is not allowed' })
  @ApiUnsupportedMediaTypeResponse({ description: 'JSON body required' })
  @ApiTooManyRequestsResponse({ description: 'Registration unavailable' })
  @ApiServiceUnavailableResponse({ description: 'Registration unavailable' })
  register(
    @Body(RegistrationZodPipe) dto: RegisterDto,
    @Req() request: RegistrationRequest,
  ): Promise<RegistrationAcceptedDto> {
    return this.registration.register(dto, request.registrationRequestId);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @UseGuards(LoginRequestGuard)
  @ApiBody({ required: true, type: LoginDto })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiOkResponse({
    headers: {
      'Set-Cookie': {
        description: 'Host-only HttpOnly session cookie.',
        schema: { type: 'string' },
      },
    },
    type: AuthSessionDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiForbiddenResponse({ description: 'Origin is not allowed' })
  @ApiUnsupportedMediaTypeResponse({ description: 'JSON body required' })
  @ApiTooManyRequestsResponse({ description: 'Login unavailable' })
  @ApiServiceUnavailableResponse({ description: 'Login unavailable' })
  async login(
    @Body(LoginZodPipe) dto: LoginDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionDto> {
    const mode = this.cookieMode();
    const presented = readSessionCookie(request.get('cookie'), mode);
    const session = await this.loginService.login(dto, presented);
    response.setHeader(
      'Set-Cookie',
      createSessionCookie(
        mode,
        session.rawToken,
        session.expiresAt,
        dto.rememberMe,
      ),
    );
    return toSessionDto(session);
  }

  @Get('session')
  @ApiCookieAuth('sessionCookie')
  @ApiOkResponse({ type: AuthSessionDto })
  @ApiUnauthorizedResponse({ description: 'Session is not valid' })
  session(@Req() request: AuthRequest): AuthSessionDto {
    return toSessionDto(requireActiveSession(request));
  }

  @Get('csrf')
  @ApiCookieAuth('sessionCookie')
  @ApiOkResponse({ type: CsrfResponseDto })
  @ApiUnauthorizedResponse({ description: 'Session is not valid' })
  getCsrf(@Req() request: AuthRequest): CsrfResponseDto {
    const session = requireActiveSession(request);
    return { csrfToken: this.csrf.issue(session.rawToken) };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiCookieAuth('sessionCookie')
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  })
  @ApiOkResponse({
    headers: {
      'Set-Cookie': {
        description: 'Clears the configured host-only session cookie.',
        schema: { type: 'string' },
      },
    },
    type: LogoutResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Session is not valid' })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponseDto> {
    const session = requireActiveSession(request);
    await this.sessions.revokeCurrent(session.rawToken);
    response.setHeader('Set-Cookie', clearSessionCookie(this.cookieMode()));
    return { status: 'signed-out' };
  }

  private cookieMode(): AuthCookieMode {
    return this.config.getOrThrow<AuthCookieMode>('AUTH_COOKIE_MODE');
  }
}

const IDLE_LIFETIME_MS = 24 * 60 * 60 * 1_000;

function toSessionDto(session: ActiveSession): AuthSessionDto {
  const idleExpiresAt = new Date(
    Math.min(
      session.expiresAt.getTime(),
      session.lastSeenAt.getTime() + IDLE_LIFETIME_MS,
    ),
  );
  return {
    absoluteExpiresAt: session.expiresAt.toISOString(),
    idleExpiresAt: idleExpiresAt.toISOString(),
    issuedAt: session.issuedAt.toISOString(),
    user: { id: session.userId, role: session.role, status: session.status },
  };
}

function requireActiveSession(request: AuthRequest): ActiveSession {
  if (!request.activeSession) throw new Error('Session guard invariant failed');
  return request.activeSession;
}
