import { ApiProperty } from '@nestjs/swagger';
import { CurrentUserDto } from './current-user.dto';

export class AuthSessionDto {
  @ApiProperty({ format: 'date-time', type: String })
  absoluteExpiresAt!: string;

  @ApiProperty({ format: 'date-time', type: String })
  idleExpiresAt!: string;

  @ApiProperty({ format: 'date-time', type: String })
  issuedAt!: string;

  @ApiProperty({ type: CurrentUserDto })
  user!: CurrentUserDto;
}
