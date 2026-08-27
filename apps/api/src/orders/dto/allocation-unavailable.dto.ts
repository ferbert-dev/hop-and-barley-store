import { ApiProperty } from '@nestjs/swagger';
import { CheckoutReadinessLineDto } from '../../cart/dto/cart-response.dto';

export class AllocationUnavailableDto {
  @ApiProperty({ enum: ['allocation-unavailable'], type: String })
  status!: 'allocation-unavailable';

  @ApiProperty({ format: 'date-time', type: String })
  checkedAt!: string;

  @ApiProperty({ type: () => [CheckoutReadinessLineDto] })
  lines!: CheckoutReadinessLineDto[];
}
