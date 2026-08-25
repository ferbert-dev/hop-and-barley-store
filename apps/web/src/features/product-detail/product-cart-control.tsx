'use client';

import { useEffect } from 'react';

import { Button } from '../../components/ui/button';
import { ErrorState } from '../../components/ui/status';
import { useCart } from '../cart/cart-context';
import styles from './product-detail.module.css';

type ProductCartControlProps = Readonly<{
  availability: 'in-stock' | 'out-of-stock';
  productName: string;
  productSlug: string;
}>;

export function ProductCartControl({
  availability,
  productName,
  productSlug,
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
      {item ? (
        <CartQuantityControl
          item={item}
          productName={productName}
          productSlug={productSlug}
        />
      ) : (
        <AddToCartControl
          availability={availability}
          loading={loading}
          productName={productName}
          productSlug={productSlug}
        />
      )}
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
}: ProductCartControlProps & Readonly<{ loading: boolean }>) {
  const { add, pending } = useCart();
  const outOfStock = availability === 'out-of-stock';

  return (
    <>
      <Button
        disabled={loading || outOfStock || pending !== null}
        onClick={() => void add(productSlug, 1)}
        pending={pending?.kind === 'add'}
        pendingLabel={`Adding ${productName}…`}
      >
        Add to Cart
      </Button>
      {loading ? (
        <p className={styles.cartMessage} role="status">
          Loading your cart…
        </p>
      ) : null}
      {outOfStock ? (
        <p className={styles.cartAvailability} role="status">
          Out of stock
        </p>
      ) : null}
    </>
  );
}

function CartQuantityControl({
  item,
  productName,
  productSlug,
}: Readonly<{
  item: ReturnType<typeof useCart>['items'][number];
  productName: string;
  productSlug: string;
}>) {
  const { pending, remove, state, update } = useCart();
  const reservationExpired =
    item.reservationStatus === 'expired' ||
    (item.reservationStatus === 'active' &&
      item.reservationExpiresAt !== null &&
      state.kind === 'ready' &&
      Date.parse(item.reservationExpiresAt) <=
        Date.parse(state.cart.serverNow));
  const unavailable = item.availability === 'unavailable' || reservationExpired;

  return (
    <>
      <div
        aria-label={`Quantity for ${productName}`}
        className={styles.cartQuantity}
      >
        <Button
          aria-label={`Decrease ${productName} quantity`}
          disabled={pending !== null || unavailable}
          onClick={() =>
            void (item.quantity === 1
              ? remove(productSlug)
              : update(productSlug, item.quantity - 1))
          }
          variant="secondary"
        >
          −
        </Button>
        <output aria-live="polite">{item.quantity} in cart</output>
        <Button
          aria-label={`Increase ${productName} quantity`}
          disabled={pending !== null || unavailable || item.quantity >= 99}
          onClick={() => void update(productSlug, item.quantity + 1)}
          variant="secondary"
        >
          +
        </Button>
      </div>
      {item.availability === 'unavailable' && !reservationExpired ? (
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
