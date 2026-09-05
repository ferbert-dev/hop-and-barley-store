'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { ErrorState } from '../../components/ui/status';
import { useCart } from '../cart/cart-context';
import { QuantityForm } from '../quantity/quantity-form';
import {
  formatAmount,
  type QuantityMetadata,
} from '../quantity/quantity-model';
import styles from './product-detail.module.css';

type ProductCartControlProps = Readonly<{
  availability: 'in-stock' | 'out-of-stock';
  currency: string;
  productName: string;
  productSlug: string;
  priceMinor: number;
  quantityMetadata: QuantityMetadata;
}>;

export function ProductCartControl({
  currency,
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
        currency={currency}
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
  currency,
  loading,
  productName,
  productSlug,
  priceMinor,
  quantityMetadata,
}: Omit<ProductCartControlProps, 'availability'> &
  Readonly<{
    loading: boolean;
  }>) {
  const { add, items, pending, state } = useCart();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const actionRowRef = useRef<HTMLDivElement>(null);
  const getAddButton = useCallback(
    () =>
      actionRowRef.current?.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      ) ?? null,
    [],
  );
  const cartItem = items.find((item) => item.productSlug === productSlug);
  const inCartAmount = cartItem
    ? formatAmount(cartItem.amount, cartItem)
    : null;

  return (
    <>
      <div className={styles.cartActionRow} ref={actionRowRef}>
        <QuantityForm
          amount={
            quantityMetadata.saleKind === 'WEIGHT'
              ? 100_000
              : quantityMetadata.minimumOrderAmount
          }
          currency={state.kind === 'ready' ? state.cart.currency : currency}
          disabled={loading || pending !== null}
          metadata={quantityMetadata}
          onSubmit={async (amount) => {
            if (await add(productSlug, amount)) {
              setConfirmationOpen(true);
            }
          }}
          priceMinor={priceMinor}
          submitLabel={`Add ${productName} to Cart`}
          weightUnitPlacement="label"
        />
        {inCartAmount ? (
          <Button
            className={styles.inCartLink}
            href="/cart"
            variant="secondary"
          >
            In cart: {inCartAmount}
          </Button>
        ) : null}
      </div>
      {loading ? (
        <p className={styles.cartMessage} role="status">
          Loading your cart…
        </p>
      ) : null}
      <Dialog
        description={
          inCartAmount
            ? `Your cart now contains ${inCartAmount} of ${productName}.`
            : `${productName} was added to your cart.`
        }
        id="product-add-confirmation"
        onOpenChange={setConfirmationOpen}
        open={confirmationOpen}
        returnFocus={getAddButton}
        title={`${productName} added to your cart`}
      >
        <div className={styles.confirmationActions}>
          <Button
            onClick={() => setConfirmationOpen(false)}
            type="button"
            variant="secondary"
          >
            Continue shopping
          </Button>
          <Button href="/cart">Go to cart</Button>
        </div>
      </Dialog>
    </>
  );
}
