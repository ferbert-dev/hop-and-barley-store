import { ApiProperty } from '@nestjs/swagger';
import { AuthSessionDto } from './auth-session.dto';

export class LoginResponseDto extends AuthSessionDto {
  @ApiProperty({ enum: ['not_present', 'succeeded', 'unavailable'] })
  cartMerge!: 'not_present' | 'succeeded' | 'unavailable';
}
