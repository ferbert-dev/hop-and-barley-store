import { ApiProperty } from '@nestjs/swagger';

import { ProductDto } from './product.dto';

export class ProductSpecificationDto {
  @ApiProperty({ minLength: 1, type: String })
  label!: string;

  @ApiProperty({
    oneOf: [
      { minLength: 1, type: 'string' },
      {
        items: { minLength: 1, type: 'string' },
        minItems: 1,
        type: 'array',
      },
    ],
    type: Array,
  })
  value!: string | string[];
}

export class ProductDetailDto extends ProductDto {
  @ApiProperty({
    isArray: true,
    minItems: 1,
    type: () => ProductSpecificationDto,
  })
  specifications!: ProductSpecificationDto[];
}
