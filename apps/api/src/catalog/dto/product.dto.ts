import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  slug!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ example: 499, type: Number })
  priceMinor!: number;

  @ApiProperty({ example: 'EUR', type: String })
  currency!: string;
}
