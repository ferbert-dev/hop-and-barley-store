import { ApiProperty } from '@nestjs/swagger';

export class LogoutResponseDto {
  @ApiProperty({ enum: ['signed-out'] })
  status!: 'signed-out';
}
