'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Price } from '../../components/ui/price';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../components/ui/status';
import { useCart, type CartContextValue, type CartState } from './cart-context';
import type { Cart } from './cart-transport';
import styles from './cart.module.css';

type CartScreenProps = Readonly<{ initialState?: CartState }>;

export function CartScreen({ initialState }: CartScreenProps) {
  if (initialState) return <CartScreenContent state={initialState} />;
  return <ConnectedCartScreen />;
}

function ConnectedCartScreen() {
  const cart = useCart();
  const { refresh } = cart;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <CartScreenContent {...cart} />;
}

type CartScreenContentProps = Pick<
  CartContextValue,
  | 'clear'
  | 'items'
  | 'pending'
  | 'recheck'
  | 'refresh'
  | 'remove'
  | 'state'
  | 'totalsAreRefreshing'
  | 'update'
>;

function CartScreenContent({
  clear,
  items,
  pending,
  recheck,
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
      clear={clear}
      key={state.cart.serverNow}
      message={state.message}
      pending={pending}
      recheck={recheck}
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
  clear,
  message,
  pending,
  recheck,
  remove,
  totalsAreRefreshing,
  update,
}: Readonly<{
  cart: Cart;
  cartItems: Cart['items'];
  clear?: CartContextValue['clear'];
  message?: string;
  pending?: CartContextValue['pending'];
  recheck?: CartContextValue['recheck'];
  remove?: CartContextValue['remove'];
  totalsAreRefreshing: boolean;
  update?: CartContextValue['update'];
}>) {
  const reservation = useReservationClock(cart);
  const hasUnavailableItem = cartItems.some(
    (item) => item.availability === 'unavailable',
  );
  const checkoutEligible =
    cart.checkoutEligible &&
    !hasUnavailableItem &&
    !reservation.hasExpired &&
    !totalsAreRefreshing;

  return (
    <section aria-labelledby="cart-title" className={styles.page}>
      <div className={styles.heading}>
        <h1 id="cart-title">Shopping Cart</h1>
        <Button
          disabled={pending !== null}
          onClick={() => void clear?.()}
          pending={pending?.kind === 'clear'}
          pendingLabel="Clearing cart…"
          type="button"
          variant="secondary"
        >
          Clear cart
        </Button>
      </div>

      {message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}

      <ReservationStatus
        hasExpired={reservation.hasExpired}
        pending={pending}
        recheck={recheck}
        remainingSeconds={reservation.remainingSeconds}
      />

      <div className={styles.layout}>
        <div className={styles.lines} aria-label="Cart items">
          {cartItems.map((item) => {
            const itemIsPending = isPendingForProduct(
              pending,
              item.productSlug,
            );
            const itemReservationExpired =
              item.reservationStatus === 'expired' ||
              (item.reservationStatus === 'active' &&
                item.reservationExpiresAt !== null &&
                Date.parse(item.reservationExpiresAt) <=
                  reservation.serverTime);

            return (
              <Card className={styles.line} key={item.productSlug}>
                <Image
                  alt=""
                  className={styles.image}
                  height={160}
                  sizes="(max-width: 47.999rem) 7rem, 10rem"
                  src={item.imagePath}
                  width={160}
                />
                <div className={styles.lineContent}>
                  <div>
                    <h2>{item.name}</h2>
                    <p className={styles.qualifier}>{item.priceQualifier}</p>
                    {item.availability === 'unavailable' ? (
                      <p className={styles.availability} role="status">
                        Out of stock
                      </p>
                    ) : null}
                    {itemReservationExpired ? (
                      <p className={styles.reservationLineStatus} role="status">
                        Reservation expired
                      </p>
                    ) : null}
                  </div>
                  <div className={styles.linePrices}>
                    {itemIsPending ? (
                      <span aria-live="polite">
                        Line total updating from the store…
                      </span>
                    ) : item.lineTotalMinor === null ? (
                      <span>Price currently unavailable</span>
                    ) : (
                      <Price
                        currency={cart.currency}
                        minorUnits={item.lineTotalMinor}
                      />
                    )}
                    {item.currentUnitPriceMinor === null ? null : (
                      <span className={styles.unitPrice}>
                        <Price
                          currency={cart.currency}
                          minorUnits={item.currentUnitPriceMinor}
                        />{' '}
                        {item.priceQualifier}
                      </span>
                    )}
                  </div>
                  <div className={styles.lineActions}>
                    <div
                      aria-label={`Quantity for ${item.name}`}
                      className={styles.quantity}
                    >
                      <Button
                        aria-label={`Decrease ${item.name} quantity`}
                        disabled={
                          pending !== null ||
                          item.availability === 'unavailable' ||
                          itemReservationExpired
                        }
                        onClick={() =>
                          void (item.quantity === 1
                            ? remove?.(item.productSlug)
                            : update?.(item.productSlug, item.quantity - 1))
                        }
                        type="button"
                        variant="secondary"
                      >
                        −
                      </Button>
                      <output aria-live="polite">
                        {item.quantity} in cart
                      </output>
                      <Button
                        aria-label={`Increase ${item.name} quantity`}
                        disabled={
                          pending !== null ||
                          item.availability === 'unavailable' ||
                          itemReservationExpired ||
                          item.quantity >= 99
                        }
                        onClick={() =>
                          void update?.(item.productSlug, item.quantity + 1)
                        }
                        type="button"
                        variant="secondary"
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      aria-label={`Remove ${item.name} from cart`}
                      className={styles.remove}
                      disabled={pending !== null}
                      onClick={() => void remove?.(item.productSlug)}
                      pending={pending?.kind === 'remove' && itemIsPending}
                      pendingLabel={`Removing ${item.name}…`}
                      type="button"
                      variant="danger"
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
                {totalsAreRefreshing ? (
                  <span aria-live="polite">Updating from the store…</span>
                ) : (
                  <Price
                    currency={cart.currency}
                    minorUnits={cart.subtotalMinor}
                  />
                )}
              </dd>
            </div>
          </dl>
          {!totalsAreRefreshing && !checkoutEligible ? (
            <p className={styles.ineligible} role="status">
              {hasUnavailableItem
                ? 'Remove unavailable items before checkout.'
                : reservation.hasExpired
                  ? 'Recheck availability before checkout.'
                  : 'Your cart is not ready for checkout.'}
            </p>
          ) : null}
          {checkoutEligible ? (
            <Button className={styles.checkout} href="/checkout">
              Proceed to Checkout
            </Button>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function ReservationStatus({
  hasExpired,
  pending,
  recheck,
  remainingSeconds,
}: Readonly<{
  hasExpired: boolean;
  pending?: CartContextValue['pending'];
  recheck?: CartContextValue['recheck'];
  remainingSeconds: number | null;
}>) {
  if (hasExpired) {
    return (
      <div className={styles.reservationNotice}>
        <p role="status">
          Reservations expired. Recheck availability before checkout.
        </p>
        {recheck ? (
          <Button
            disabled={pending !== null}
            onClick={() => void recheck()}
            pending={pending?.kind === 'recheck'}
            pendingLabel="Checking availability…"
            type="button"
            variant="secondary"
          >
            Recheck availability
          </Button>
        ) : null}
      </div>
    );
  }

  if (remainingSeconds === null) return null;

  return (
    <p className={styles.reservationCountdown} role="timer">
      Reservations expire in {formatCountdown(remainingSeconds)}
    </p>
  );
}

function useReservationClock(cart: Cart) {
  const earliestActiveExpiry = getEarliestActiveExpiry(cart.items);
  const [elapsedSinceResponse, setElapsedSinceResponse] = useState(0);

  useEffect(() => {
    if (earliestActiveExpiry === null) return;

    const responseReceivedAt = Date.now();
    const remainingAtResponse = Math.max(
      0,
      earliestActiveExpiry - Date.parse(cart.serverNow),
    );
    if (remainingAtResponse === 0) return;

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - responseReceivedAt;
      setElapsedSinceResponse(Math.min(elapsed, remainingAtResponse));
      if (elapsed >= remainingAtResponse) window.clearInterval(timer);
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [cart.serverNow, earliestActiveExpiry]);

  const serverNow = Date.parse(cart.serverNow);
  const serverTime = serverNow + elapsedSinceResponse;
  const activeReservationHasExpired =
    earliestActiveExpiry !== null && earliestActiveExpiry <= serverTime;

  return {
    hasExpired:
      activeReservationHasExpired ||
      cart.items.some((item) => item.reservationStatus === 'expired'),
    remainingSeconds:
      earliestActiveExpiry === null
        ? null
        : Math.max(0, Math.ceil((earliestActiveExpiry - serverTime) / 1_000)),
    serverTime,
  };
}

function getEarliestActiveExpiry(items: Cart['items']): number | null {
  let earliestExpiry: number | null = null;
  for (const item of items) {
    if (
      item.reservationStatus !== 'active' ||
      item.reservationExpiresAt === null
    ) {
      continue;
    }
    const expiry = Date.parse(item.reservationExpiresAt);
    if (earliestExpiry === null || expiry < earliestExpiry) {
      earliestExpiry = expiry;
    }
  }
  return earliestExpiry;
}

function formatCountdown(remainingSeconds: number) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
