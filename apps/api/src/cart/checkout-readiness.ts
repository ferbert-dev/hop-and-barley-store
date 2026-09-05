import {
  calculateLineTotalMinor,
  isValidOrderAmount,
  type ProductAmountRules,
} from '../catalog/product-amount';
import type { CheckoutReadinessLineDto } from './dto/cart-response.dto';
import { isPublicProductEligible } from '../catalog/product-public-eligibility';

export type CheckoutProduct = ProductAmountRules &
  Readonly<{
    activeFrom: Date | null;
    activeUntil: Date | null;
    currency: string;
    isActive: boolean;
    priceBasisAmount: number;
    priceMinor: number;
    stockAmount: number;
  }>;

export function checkoutLineOutcome(
  product: CheckoutProduct | null | undefined,
  requestedAmount: number,
  evaluatedAt: Date,
): CheckoutReadinessLineDto['outcome'] {
  if (
    !product ||
    !isPublicProductEligible(product, evaluatedAt) ||
    product.currency !== 'EUR'
  ) {
    return 'product_unavailable';
  }
  if (!isValidOrderAmount(requestedAmount, product)) return 'invalid_amount';
  try {
    calculateLineTotalMinor(
      product.priceMinor,
      requestedAmount,
      product.priceBasisAmount,
    );
  } catch {
    return 'price_unavailable';
  }
  if (product.stockAmount < requestedAmount) return 'insufficient_stock';
  return 'available';
}
