import { ApiProperty } from '@nestjs/swagger';

export class RegistrationAcceptedDto {
  @ApiProperty({ enum: ['accepted'], example: 'accepted' })
  status!: 'accepted';
}
