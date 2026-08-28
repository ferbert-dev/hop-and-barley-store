import { ApiProperty } from '@nestjs/swagger';

export class AdminCapabilitiesDto {
  @ApiProperty({
    description: 'Current administrator may enter product management.',
    example: true,
    type: Boolean,
  })
  productManagement!: true;
}
