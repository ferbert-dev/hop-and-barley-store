'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Price } from '../../components/ui/price';
import { isUploadedProductImagePath } from '../../lib/product-image';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/ui/status';
import { useCart, type CartContextValue, type CartState } from './cart-context';
import type { Cart, CheckoutReadiness } from './cart-transport';
import { QuantityForm } from '../quantity/quantity-form';
import {
  formatAggregateProductDetail,
  formatSaleUnit,
} from '../quantity/quantity-model';
import styles from './cart.module.css';

type CartScreenProps = Readonly<{ initialState?: CartState }>;

export function CartScreen({ initialState }: CartScreenProps) {
  if (initialState) return <CartScreenContent state={initialState} />;
  return <ConnectedCartScreen />;
}

function ConnectedCartScreen() {
  const cart = useCart();
  const { ensureLoaded } = cart;

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  return <CartScreenContent {...cart} />;
}

type CartScreenContentProps = Pick<
  CartContextValue,
  | 'clear'
  | 'checkCheckoutReadiness'
  | 'items'
  | 'pending'
  | 'refresh'
  | 'remove'
  | 'state'
  | 'totalsAreRefreshing'
  | 'update'
>;

function CartScreenContent({
  clear,
  checkCheckoutReadiness,
  items,
  pending,
  refresh,
  remove,
  state,
  totalsAreRefreshing = false,
  update,
}: Partial<CartScreenContentProps> & Pick<CartScreenContentProps, 'state'>) {
  if (state.kind === 'loading') return <CartLoadingState />;
  if (state.kind === 'unavailable') {
    return <CartUnavailableState refresh={refresh} />;
  }

  const cartItems = items ?? state.cart.items;
  if (cartItems.length === 0 && !totalsAreRefreshing) {
    return <CartEmptyState />;
  }

  return (
    <CartContents
      cart={state.cart}
      cartItems={cartItems}
      checkCheckoutReadiness={checkCheckoutReadiness}
      clear={clear}
      message={state.message}
      pending={pending}
      remove={remove}
      totalsAreRefreshing={totalsAreRefreshing}
      update={update}
    />
  );
}

function CartLoadingState() {
  return (
    <section aria-labelledby="cart-title" className={styles.page}>
      <h1 className={styles.stateTitle} id="cart-title">
        Shopping Cart
      </h1>
      <LoadingState title="Loading your cart">
        Checking the latest cart details.
      </LoadingState>
    </section>
  );
}

function CartUnavailableState({
  refresh,
}: Readonly<{ refresh?: CartContextValue['refresh'] }>) {
  return (
    <section aria-labelledby="cart-title" className={styles.page}>
      <h1 className={styles.stateTitle} id="cart-title">
        Shopping Cart
      </h1>
      <ErrorState
        action={
          refresh ? (
            <Button
              onClick={() => void refresh()}
              type="button"
              variant="secondary"
            >
              Try again
            </Button>
          ) : undefined
        }
        title="Your cart is unavailable"
      >
        The store could not load your private cart safely. Try again shortly.
      </ErrorState>
    </section>
  );
}

function CartEmptyState() {
  return (
    <section aria-labelledby="cart-title" className={styles.page}>
      <h1 className={styles.stateTitle} id="cart-title">
        Shopping Cart
      </h1>
      <EmptyState
        action={<Button href="/">Continue shopping</Button>}
        title="Your cart is empty"
      >
        Add brewing ingredients to see them here.
      </EmptyState>
    </section>
  );
}

function CartContents({
  cart,
  cartItems,
  checkCheckoutReadiness,
  clear,
  message,
  pending,
  remove,
  totalsAreRefreshing,
  update,
}: Readonly<{
  cart: Cart;
  cartItems: Cart['items'];
  checkCheckoutReadiness?: CartContextValue['checkCheckoutReadiness'];
  clear?: CartContextValue['clear'];
  message?: string;
  pending?: CartContextValue['pending'];
  remove?: CartContextValue['remove'];
  totalsAreRefreshing: boolean;
  update?: CartContextValue['update'];
}>) {
  const router = useRouter();
  const [readinessState, setReadinessState] = useState<{
    cart: Cart;
    result: CheckoutReadiness;
  } | null>(null);
  const [readinessErrorCart, setReadinessErrorCart] = useState<Cart | null>(
    null,
  );
  const readiness =
    readinessState?.cart === cart ? readinessState.result : null;
  const readinessError = readinessErrorCart === cart;

  const checkingAvailability = pending?.kind === 'checkout-readiness';
  const readinessByProductSlug = new Map(
    readiness?.lines.map((line) => [line.productSlug, line]),
  );
  const hasReadinessAttention =
    readiness !== null && readiness.status !== 'ready';
  const displayedSubtotalMinor = totalsAreRefreshing
    ? cartItems.reduce(
        (subtotal, item) => subtotal + (item.lineTotalMinor ?? 0),
        0,
      )
    : cart.subtotalMinor;

  const proceedToCheckout = async () => {
    if (
      !checkCheckoutReadiness ||
      checkingAvailability ||
      totalsAreRefreshing
    ) {
      return;
    }

    setReadinessErrorCart(null);
    try {
      const nextReadiness = await checkCheckoutReadiness();
      setReadinessState({ cart, result: nextReadiness });
      if (nextReadiness.status === 'ready') router.push('/checkout');
    } catch {
      setReadinessState(null);
      setReadinessErrorCart(cart);
    }
  };

  return (
    <section aria-labelledby="cart-title" className={styles.page}>
      <div className={styles.heading}>
        <h1 id="cart-title">Shopping Cart</h1>
        <Button
          disabled={pending !== null && pending !== undefined}
          onClick={() => void clear?.()}
          pending={pending?.kind === 'clear'}
          pendingLabel="Clearing cart…"
          type="button"
          variant="secondary"
          className={styles.stableSecondary}
        >
          Clear cart
        </Button>
      </div>

      {message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.lines} aria-label="Cart items">
          {cartItems.map((item) => {
            const itemIsPending = isPendingForProduct(
              pending,
              item.productSlug,
            );
            const quantityIsDisabled =
              pending !== null &&
              pending !== undefined &&
              !(
                pending.kind === 'update' &&
                pending.productSlug === item.productSlug
              );
            const aggregateDetail = formatAggregateProductDetail(
              item.amount,
              item,
            );
            const readinessLine = readinessByProductSlug.get(item.productSlug);
            const readinessMessage = readinessLine
              ? formatReadinessOutcome(readinessLine.outcome)
              : null;

            return (
              <Card className={styles.line} key={item.productSlug}>
                <Link
                  aria-label={`View ${item.name}`}
                  className={styles.imageLink}
                  href={`/product/${item.productSlug}`}
                >
                  <Image
                    alt=""
                    className={styles.image}
                    height={160}
                    sizes="(max-width: 47.999rem) 7rem, 10rem"
                    src={item.imagePath}
                    unoptimized={isUploadedProductImagePath(item.imagePath)}
                    width={160}
                  />
                </Link>
                <div className={styles.lineContent}>
                  <div className={styles.productInfo}>
                    <h2>
                      <Link href={`/product/${item.productSlug}`}>
                        {item.name}
                      </Link>
                    </h2>
                    <p className={styles.unitPrice}>
                      {item.priceMinor === null ? (
                        <>Price currently unavailable {formatSaleUnit(item)}</>
                      ) : (
                        <>
                          <Price
                            currency={cart.currency}
                            minorUnits={item.priceMinor}
                          />{' '}
                          {formatSaleUnit(item)}
                        </>
                      )}
                    </p>
                    {aggregateDetail ? (
                      <p className={styles.aggregateDetail}>
                        {aggregateDetail}
                      </p>
                    ) : null}
                    {readinessMessage ? (
                      <p className={styles.readinessLineStatus} role="status">
                        {readinessMessage}
                      </p>
                    ) : null}
                  </div>
                  <div className={styles.linePrices}>
                    <span aria-atomic="true" aria-live="polite">
                      {item.lineTotalMinor === null ? (
                        <span>Price currently unavailable</span>
                      ) : (
                        <Price
                          currency={cart.currency}
                          minorUnits={item.lineTotalMinor}
                        />
                      )}
                    </span>
                  </div>
                  <div className={styles.lineActions}>
                    <QuantityForm
                      amount={item.amount}
                      ariaLabel={`${item.name} quantity`}
                      busy={itemIsPending}
                      currency={cart.currency}
                      disabled={quantityIsDisabled}
                      metadata={item}
                      mode="auto"
                      onSubmit={(amount) => update?.(item.productSlug, amount)}
                      priceMinor={item.priceMinor}
                    />
                    <Button
                      aria-label={`Remove ${item.name} from cart`}
                      className={styles.remove}
                      disabled={pending !== null && pending !== undefined}
                      onClick={() => void remove?.(item.productSlug)}
                      pending={pending?.kind === 'remove' && itemIsPending}
                      pendingLabel={`Removing ${item.name}…`}
                      type="button"
                      variant="secondary"
                    >
                      <span aria-hidden="true">X</span>
                      <span>Remove</span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <aside aria-label="Cart summary" className={styles.summary}>
          <dl>
            <div className={styles.total}>
              <dt>Total</dt>
              <dd>
                <span aria-atomic="true" aria-live="polite">
                  <Price
                    currency={cart.currency}
                    minorUnits={displayedSubtotalMinor}
                  />
                </span>
              </dd>
            </div>
          </dl>
          {hasReadinessAttention ? (
            <p className={styles.availabilityAttention} role="status">
              Availability needs attention
            </p>
          ) : null}
          {readinessError ? (
            <p className={styles.readinessError} role="alert">
              We couldn’t check availability. Try again.
            </p>
          ) : null}
          <Button
            className={styles.checkout}
            disabled={totalsAreRefreshing || checkingAvailability}
            onClick={() => void proceedToCheckout()}
            pending={checkingAvailability}
            pendingLabel="Checking availability…"
            type="button"
          >
            Proceed to Checkout
          </Button>
        </aside>
      </div>
    </section>
  );
}

function formatReadinessOutcome(
  outcome: CheckoutReadiness['lines'][number]['outcome'],
): string | null {
  switch (outcome) {
    case 'available':
      return null;
    case 'product_unavailable':
      return 'This item is no longer available.';
    case 'insufficient_stock':
      return 'This amount is not currently available.';
    case 'invalid_amount':
      return 'Choose a valid amount for this item.';
    case 'price_unavailable':
      return 'This item cannot be checked out right now.';
  }
}

function isPendingForProduct(
  pending: CartContextValue['pending'] | undefined,
  productSlug: string,
) {
  return (
    pending !== null &&
    pending !== undefined &&
    'productSlug' in pending &&
    pending.productSlug === productSlug
  );
}
