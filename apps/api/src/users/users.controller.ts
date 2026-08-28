import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Patch,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth-request';
import { MAX_AVATAR_BYTES, type UploadedAvatarFile } from './avatar-file';
import {
  AvatarMetadataDto,
  CurrentUserProfileDto,
  UpdateCurrentUserDto,
} from './dto/user-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth('sessionCookie')
@ApiUnauthorizedResponse({ description: 'Session is not valid' })
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Read the active session user profile' })
  @ApiOkResponse({ type: CurrentUserProfileDto })
  getCurrent(@Req() request: AuthRequest): Promise<CurrentUserProfileDto> {
    return this.users.getCurrent(requireUserId(request));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the active session user profile' })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader(csrfHeader())
  @ApiBody({ required: true, type: UpdateCurrentUserDto })
  @ApiOkResponse({ type: CurrentUserProfileDto })
  @ApiBadRequestResponse({
    description: 'Invalid, unsupported or unavailable profile value',
  })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  updateCurrent(
    @Req() request: AuthRequest,
    @Body() dto: UpdateCurrentUserDto,
  ): Promise<CurrentUserProfileDto> {
    return this.users.updateCurrent(requireUserId(request), dto);
  }

  @Put('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fields: 0, files: 1, fileSize: MAX_AVATAR_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Replace the active session user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader(csrfHeader())
  @ApiBody({
    required: true,
    schema: {
      properties: { file: { format: 'binary', type: 'string' } },
      required: ['file'],
      type: 'object',
    },
  })
  @ApiOkResponse({ type: AvatarMetadataDto })
  @ApiBadRequestResponse({ description: 'Missing or invalid avatar' })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiPayloadTooLargeResponse({ description: 'Avatar exceeds 2 MB' })
  @ApiUnsupportedMediaTypeResponse({
    description:
      'Avatar MIME type and file signature must match JPEG, PNG or WebP',
  })
  saveAvatar(
    @Req() request: AuthRequest,
    @UploadedFile() file: UploadedAvatarFile | undefined,
  ): Promise<AvatarMetadataDto> {
    return this.users.saveAvatar(requireUserId(request), file);
  }

  @Get('me/avatar')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Read the active session user avatar' })
  @ApiOkResponse({
    content: {
      'image/jpeg': { schema: { format: 'binary', type: 'string' } },
      'image/png': { schema: { format: 'binary', type: 'string' } },
      'image/webp': { schema: { format: 'binary', type: 'string' } },
    },
    description: 'Private avatar bytes',
  })
  @ApiNotFoundResponse({ description: 'No avatar is stored' })
  async readAvatar(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const avatar = await this.users.readAvatar(requireUserId(request));
    response.setHeader('Content-Type', avatar.contentType);
    response.setHeader('Content-Length', avatar.sizeBytes.toString());
    return new StreamableFile(Buffer.from(avatar.bytes));
  }

  @Delete('me/avatar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete the active session user avatar' })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader(csrfHeader())
  @ApiNoContentResponse({ description: 'Avatar is absent' })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  async deleteAvatar(@Req() request: AuthRequest): Promise<void> {
    await this.users.deleteAvatar(requireUserId(request));
  }
}

function requireUserId(request: AuthRequest): string {
  if (!request.activeSession) throw new Error('Session guard invariant failed');
  return request.activeSession.userId;
}

function csrfHeader() {
  return {
    name: 'X-CSRF-Token',
    required: true,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  } as const;
}
