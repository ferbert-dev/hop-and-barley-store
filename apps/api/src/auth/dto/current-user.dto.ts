import { ApiProperty } from '@nestjs/swagger';

export class CurrentUserDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN'] })
  role!: 'CUSTOMER' | 'ADMIN';

  @ApiProperty({ enum: ['ACTIVE'] })
  status!: 'ACTIVE';
}
