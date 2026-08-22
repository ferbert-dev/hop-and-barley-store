'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
import {
  validateCartContact,
  type CartContactErrors,
  type CartContactInput,
} from './cart-validation';
import styles from './cart.module.css';

type CartScreenProps = Readonly<{ initialState?: CartState }>;

export function CartScreen({ initialState }: CartScreenProps) {
  if (initialState) {
    return <CartScreenContent state={initialState} />;
  }
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
  refresh,
  remove,
  state,
  totalsAreRefreshing = false,
  update,
}: Partial<CartScreenContentProps> & Pick<CartScreenContentProps, 'state'>) {
  if (state.kind === 'loading') {
    return (
      <section aria-label="Shopping cart" className={styles.page}>
        <LoadingState title="Loading your cart">
          Checking the latest cart details.
        </LoadingState>
      </section>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <section aria-label="Shopping cart" className={styles.page}>
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

  const cartItems = items ?? state.cart.items;
  if (cartItems.length === 0 && !totalsAreRefreshing) {
    return (
      <section aria-label="Shopping cart" className={styles.page}>
        <EmptyState
          action={<Button href="/">Continue shopping</Button>}
          title="Your cart is empty"
        >
          Add brewing ingredients to see them here.
        </EmptyState>
      </section>
    );
  }

  return (
    <section aria-labelledby="cart-title" className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">Your selection</p>
          <h1 id="cart-title">Shopping cart</h1>
        </div>
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

      {state.message ? (
        <p className={styles.message} role="status">
          {state.message}
        </p>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.lines} aria-label="Cart items">
          {cartItems.map((item) => {
            const itemIsPending = isPendingForProduct(
              pending,
              item.productSlug,
            );
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
                    <p
                      className={styles.availability}
                      data-availability={item.availability}
                    >
                      {item.availability === 'available'
                        ? 'Available'
                        : 'Currently unavailable'}
                    </p>
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
                        currency={state.cart.currency}
                        minorUnits={item.lineTotalMinor}
                      />
                    )}
                    {item.currentUnitPriceMinor === null ? null : (
                      <span className={styles.unitPrice}>
                        <Price
                          currency={state.cart.currency}
                          minorUnits={item.currentUnitPriceMinor}
                        />{' '}
                        each
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
                          item.availability === 'unavailable'
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
                      <output aria-live="polite">{item.quantity}</output>
                      <Button
                        aria-label={`Increase ${item.name} quantity`}
                        disabled={
                          pending !== null ||
                          item.availability === 'unavailable' ||
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
                      disabled={pending !== null}
                      onClick={() => void remove?.(item.productSlug)}
                      pending={pending?.kind === 'remove' && itemIsPending}
                      pendingLabel="Removing…"
                      type="button"
                      variant="danger"
                    >
                      Remove {item.name}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <aside aria-labelledby="cart-summary-title" className={styles.summary}>
          <h2 id="cart-summary-title">Cart summary</h2>
          <dl>
            <div>
              <dt>Items</dt>
              <dd>
                {totalsAreRefreshing ? (
                  <span aria-live="polite">Updating from the store…</span>
                ) : (
                  state.cart.totalQuantity
                )}
              </dd>
            </div>
            <div className={styles.total}>
              <dt>Total</dt>
              <dd>
                {totalsAreRefreshing ? (
                  <span aria-live="polite">Updating from the store…</span>
                ) : (
                  <Price
                    currency={state.cart.currency}
                    minorUnits={state.cart.subtotalMinor}
                  />
                )}
              </dd>
            </div>
          </dl>
          {!totalsAreRefreshing && !state.cart.checkoutEligible ? (
            <p className={styles.ineligible} role="status">
              Your cart needs an available item before checkout.
            </p>
          ) : null}
        </aside>
      </div>

      {!totalsAreRefreshing && state.cart.checkoutEligible ? (
        <CartContactForm />
      ) : null}
    </section>
  );
}

function CartContactForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<CartContactErrors>({});

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = validateCartContact(readContactInput(form));
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    router.push('/checkout');
  };

  return (
    <form className={styles.form} noValidate onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">Required for checkout</p>
        <h2>Contact and shipping details</h2>
        <p className={styles.formIntro}>
          Confirm these details before continuing to the checkout step.
        </p>
      </div>
      <div className={styles.fields}>
        <ContactField
          error={errors.fullName}
          label="Full name"
          name="fullName"
        />
        <ContactField
          error={errors.phone}
          label="Phone number"
          name="phone"
          type="tel"
        />
        <ContactField error={errors.city} label="City" name="city" />
        <label className={styles.field} htmlFor="shippingAddress">
          <span>Shipping address</span>
          <textarea
            aria-errormessage={
              errors.shippingAddress ? 'shippingAddress-error' : undefined
            }
            aria-invalid={Boolean(errors.shippingAddress) || undefined}
            id="shippingAddress"
            maxLength={320}
            name="shippingAddress"
            rows={3}
          />
          {errors.shippingAddress ? (
            <span id="shippingAddress-error" role="alert">
              {errors.shippingAddress}
            </span>
          ) : null}
        </label>
      </div>
      <Button type="submit">Continue to checkout</Button>
    </form>
  );
}

function ContactField({
  error,
  label,
  name,
  type = 'text',
}: Readonly<{
  error?: string;
  label: string;
  name: keyof CartContactInput;
  type?: 'tel' | 'text';
}>) {
  const id = name;
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      <input
        aria-errormessage={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error) || undefined}
        id={id}
        maxLength={name === 'phone' ? 32 : 120}
        name={name}
        type={type}
      />
      {error ? (
        <span id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function readContactInput(form: FormData): CartContactInput {
  return {
    city: String(form.get('city') ?? ''),
    fullName: String(form.get('fullName') ?? ''),
    phone: String(form.get('phone') ?? ''),
    shippingAddress: String(form.get('shippingAddress') ?? ''),
  };
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
