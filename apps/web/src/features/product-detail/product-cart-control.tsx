'use client';

import { useEffect } from 'react';

import { Button } from '../../components/ui/button';
import { ErrorState } from '../../components/ui/status';
import { useCart } from '../cart/cart-context';
import { QuantityForm } from '../quantity/quantity-form';
import { type QuantityMetadata } from '../quantity/quantity-model';
import styles from './product-detail.module.css';

type ProductCartControlProps = Readonly<{
  availability: 'in-stock' | 'out-of-stock';
  productName: string;
  productSlug: string;
  priceMinor: number;
  quantityMetadata: QuantityMetadata;
}>;

export function ProductCartControl({
  productName,
  productSlug,
  priceMinor,
  quantityMetadata,
}: ProductCartControlProps) {
  const cart = useCart();
  const { ensureLoaded, pending } = cart;

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  if (cart.state.kind === 'unavailable') {
    return (
      <ErrorState
        action={
          <Button onClick={() => void cart.refresh()} variant="secondary">
            Try again
          </Button>
        }
        className={styles.cartError}
        title="Your cart is unavailable"
      >
        The store could not load your private cart safely. Try again shortly.
      </ErrorState>
    );
  }

  const loading = cart.state.kind === 'loading';
  const message = cart.state.kind === 'ready' ? cart.state.message : undefined;
  const productIsPending =
    pending?.kind === 'add' ||
    ((pending?.kind === 'remove' || pending?.kind === 'update') &&
      pending.productSlug === productSlug);

  return (
    <div className={styles.cartControl}>
      {message ? (
        <p className={styles.cartMessage} role="status">
          {message}
        </p>
      ) : null}
      <AddToCartControl
        loading={loading}
        productName={productName}
        productSlug={productSlug}
        priceMinor={priceMinor}
        quantityMetadata={quantityMetadata}
      />
      {productIsPending ? (
        <p className={styles.cartMessage} role="status">
          Updating cart…
        </p>
      ) : null}
    </div>
  );
}

function AddToCartControl({
  loading,
  productName,
  productSlug,
  priceMinor,
  quantityMetadata,
}: Omit<ProductCartControlProps, 'availability'> &
  Readonly<{
    loading: boolean;
  }>) {
  const { add, pending, state } = useCart();

  return (
    <>
      <QuantityForm
        amount={
          quantityMetadata.saleKind === 'WEIGHT'
            ? 100_000
            : quantityMetadata.minimumOrderAmount
        }
        currency={state.kind === 'ready' ? state.cart.currency : 'USD'}
        disabled={loading || pending !== null}
        metadata={quantityMetadata}
        onSubmit={(amount) => add(productSlug, amount)}
        priceMinor={priceMinor}
        submitLabel={`Add ${productName} to Cart`}
        weightUnitPlacement="label"
      />
      {loading ? (
        <p className={styles.cartMessage} role="status">
          Loading your cart…
        </p>
      ) : null}
    </>
  );
}
