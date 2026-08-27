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
  availability,
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

  const item = cart.items.find((entry) => entry.productSlug === productSlug);
  const loading = cart.state.kind === 'loading';
  const message = cart.state.kind === 'ready' ? cart.state.message : undefined;
  const reservationExpired = item
    ? item.reservationStatus === 'expired' ||
      (item.reservationStatus === 'active' &&
        item.reservationExpiresAt !== null &&
        cart.state.kind === 'ready' &&
        Date.parse(item.reservationExpiresAt) <=
          Date.parse(cart.state.cart.serverNow))
    : false;
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
        availability={availability}
        cartLineUnavailable={item?.availability === 'unavailable'}
        loading={loading}
        productName={productName}
        productSlug={productSlug}
        priceMinor={priceMinor}
        quantityMetadata={quantityMetadata}
        reservationExpired={reservationExpired}
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
  availability,
  loading,
  productName,
  productSlug,
  priceMinor,
  quantityMetadata,
  cartLineUnavailable = false,
  reservationExpired = false,
}: ProductCartControlProps &
  Readonly<{
    cartLineUnavailable?: boolean;
    loading: boolean;
    reservationExpired?: boolean;
  }>) {
  const { add, pending, state } = useCart();
  const outOfStock = availability === 'out-of-stock';
  const unavailable = outOfStock || cartLineUnavailable || reservationExpired;

  return (
    <>
      <QuantityForm
        amount={quantityMetadata.minimumOrderAmount}
        currency={state.kind === 'ready' ? state.cart.currency : 'USD'}
        disabled={loading || unavailable || pending !== null}
        metadata={quantityMetadata}
        onSubmit={(amount) => add(productSlug, amount)}
        priceMinor={priceMinor}
        submitLabel={`Add ${productName} to Cart`}
      />
      {loading ? (
        <p className={styles.cartMessage} role="status">
          Loading your cart…
        </p>
      ) : null}
      {outOfStock || (cartLineUnavailable && !reservationExpired) ? (
        <p className={styles.cartAvailability} role="status">
          Out of stock
        </p>
      ) : null}
      {reservationExpired ? (
        <p className={styles.cartReservationStatus} role="status">
          Reservation expired
        </p>
      ) : null}
    </>
  );
}
