import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { RegisterDto } from './dto/register.dto';
import { RegistrationAcceptedDto } from './dto/registration-accepted.dto';
import {
  RegistrationRequestGuard,
  type RegistrationRequest,
} from './registration-request.guard';
import { RegistrationService } from './registration.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('register')
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
    @Body() dto: RegisterDto,
    @Req() request: RegistrationRequest,
  ): Promise<RegistrationAcceptedDto> {
    return this.registration.register(dto, request.registrationRequestId);
  }
}
