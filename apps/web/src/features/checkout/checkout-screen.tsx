'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Field } from '../../components/ui/field';
import {
  createBrowserCheckoutTransport,
  type CheckoutDraft,
  type SaveCheckoutDraft,
} from './checkout-transport';
import styles from './checkout.module.css';

type CheckoutForm = {
  additionalInfo: string;
  administrativeArea: string;
  apartmentUnit: string;
  city: string;
  countryCode: string;
  email: string;
  floor: string;
  fullName: string;
  houseNumber: string;
  phoneNumber: string;
  postalCode: string;
  street: string;
};

const EMPTY_FORM: CheckoutForm = {
  additionalInfo: '',
  administrativeArea: '',
  apartmentUnit: '',
  city: '',
  countryCode: 'DE',
  email: '',
  floor: '',
  fullName: '',
  houseNumber: '',
  phoneNumber: '',
  postalCode: '',
  street: '',
};
const DRAFT_HANDOFF_KEY = 'hb-checkout-draft-handoff-v1';

export function CheckoutScreen() {
  const [form, setForm] = useState<CheckoutForm>(EMPTY_FORM);
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'unavailable'
  >('loading');
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'unavailable'
  >('idle');
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const transport = createBrowserCheckoutTransport();
    void transport.loadDraft().then(
      (draft) => {
        if (!active) return;
        if (draft) {
          clearStoredDraft();
          setForm(formFromDraft(draft));
          setLoadState('ready');
          return;
        }
        const handoff = readStoredDraft();
        if (!handoff) {
          setLoadState('ready');
          return;
        }
        setForm(formFromSaveDraft(handoff));
        void transport.saveDraft(handoff, createIdempotencyKey()).then(
          (adopted) => {
            if (!active) return;
            clearStoredDraft();
            setForm(formFromDraft(adopted));
            setLoadState('ready');
          },
          () => active && setLoadState('ready'),
        );
      },
      () => active && setLoadState('unavailable'),
    );
    return () => {
      active = false;
    };
  }, []);

  const setValue = (name: keyof CheckoutForm, value: string) => {
    idempotencyKey.current = null;
    setSaveState('idle');
    setForm((current) => ({ ...current, [name]: value }));
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveState === 'saving') return;
    setSaveState('saving');
    try {
      const draft = await createBrowserCheckoutTransport().saveDraft(
        toSaveDraft(form),
        idempotencyKey.current ??
          (idempotencyKey.current = createIdempotencyKey()),
      );
      setForm(formFromDraft(draft));
      setSaveState('saved');
    } catch {
      setSaveState('unavailable');
    }
  };

  const returnTo = '/checkout';
  const authQuery = `?next=${encodeURIComponent(returnTo)}`;

  if (loadState === 'loading') {
    return (
      <section className={styles.page}>
        <h1>Checkout</h1>
        <p role="status">Loading your private checkout details…</p>
      </section>
    );
  }
  if (loadState === 'unavailable') {
    return (
      <section className={styles.page}>
        <h1>Checkout</h1>
        <p role="alert">
          We couldn’t load your checkout details. Return to your cart and try
          again.
        </p>
        <Button href="/cart">Return to cart</Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="checkout-title" className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Secure checkout</p>
          <h1 id="checkout-title">Checkout</h1>
        </div>
        <Link href="/cart">Return to cart</Link>
      </div>
      <div className={styles.entry}>
        <div>
          <strong>Checkout as a guest</strong>
          <p>
            Your contact and delivery details are saved privately for this cart.
          </p>
        </div>
        <p>
          <Link
            href={`/login${authQuery}`}
            onClick={() => storeDraft(toSaveDraft(form))}
          >
            Sign in
          </Link>{' '}
          or{' '}
          <Link
            href={`/register${authQuery}`}
            onClick={() => storeDraft(toSaveDraft(form))}
          >
            create an account
          </Link>{' '}
          to continue with this same cart and draft.
        </p>
      </div>
      <form className={styles.layout} onSubmit={save}>
        <Card className={styles.formCard}>
          <h2>Shipping information</h2>
          <div className={styles.fields}>
            <Field
              autoComplete="name"
              id="checkout-full-name"
              label="Full Name"
              maxLength={200}
              name="fullName"
              onChange={(event) =>
                setValue('fullName', event.currentTarget.value)
              }
              required
              value={form.fullName}
            />
            <Field
              autoComplete="email"
              id="checkout-email"
              inputMode="email"
              label="Email"
              maxLength={320}
              name="email"
              onChange={(event) => setValue('email', event.currentTarget.value)}
              required
              type="email"
              value={form.email}
            />
            <Field
              autoComplete="tel"
              id="checkout-phone"
              label="Phone number"
              maxLength={32}
              minLength={3}
              name="phoneNumber"
              onChange={(event) =>
                setValue('phoneNumber', event.currentTarget.value)
              }
              required
              type="tel"
              value={form.phoneNumber}
            />
            <Field
              autoComplete="country"
              id="checkout-country"
              label="Country (ISO code)"
              list="checkout-countries"
              maxLength={2}
              name="countryCode"
              onChange={(event) =>
                setValue('countryCode', event.currentTarget.value.toUpperCase())
              }
              pattern="[A-Za-z]{2}"
              required
              value={form.countryCode}
            />
            <datalist id="checkout-countries">
              <option label="Germany" value="DE" />
              <option label="United States" value="US" />
              <option label="Spain" value="ES" />
              <option label="United Kingdom" value="GB" />
              <option label="France" value="FR" />
              <option label="Italy" value="IT" />
              <option label="Netherlands" value="NL" />
            </datalist>
            <Field
              autoComplete="address-line1"
              id="checkout-street"
              label="Street"
              maxLength={200}
              name="street"
              onChange={(event) =>
                setValue('street', event.currentTarget.value)
              }
              required
              value={form.street}
            />
            <Field
              autoComplete="address-line2"
              id="checkout-house-number"
              label="House number"
              maxLength={32}
              name="houseNumber"
              onChange={(event) =>
                setValue('houseNumber', event.currentTarget.value)
              }
              value={form.houseNumber}
            />
            <Field
              autoComplete="address-line2"
              id="checkout-apartment"
              label="Apartment or unit"
              maxLength={64}
              name="apartmentUnit"
              onChange={(event) =>
                setValue('apartmentUnit', event.currentTarget.value)
              }
              value={form.apartmentUnit}
            />
            <Field
              id="checkout-floor"
              label="Floor"
              maxLength={32}
              name="floor"
              onChange={(event) => setValue('floor', event.currentTarget.value)}
              value={form.floor}
            />
            <Field
              autoComplete="address-level2"
              id="checkout-city"
              label="City"
              maxLength={120}
              name="city"
              onChange={(event) => setValue('city', event.currentTarget.value)}
              required
              value={form.city}
            />
            <Field
              autoComplete="address-level1"
              id="checkout-area"
              label={
                form.countryCode === 'US'
                  ? 'State (two-letter code)'
                  : 'Region or state'
              }
              maxLength={120}
              name="administrativeArea"
              onChange={(event) =>
                setValue('administrativeArea', event.currentTarget.value)
              }
              required={form.countryCode === 'US'}
              value={form.administrativeArea}
            />
            <Field
              autoComplete="postal-code"
              id="checkout-postal-code"
              label="Postal code"
              maxLength={32}
              name="postalCode"
              onChange={(event) =>
                setValue('postalCode', event.currentTarget.value)
              }
              pattern={
                form.countryCode === 'DE'
                  ? '[0-9]{5}'
                  : form.countryCode === 'US'
                    ? '[0-9]{5}(-[0-9]{4})?'
                    : undefined
              }
              required={form.countryCode === 'DE' || form.countryCode === 'US'}
              value={form.postalCode}
            />
            <div className={styles.notes}>
              <label htmlFor="checkout-additional-info">Delivery notes</label>
              <textarea
                id="checkout-additional-info"
                maxLength={500}
                name="additionalInfo"
                onChange={(event) =>
                  setValue('additionalInfo', event.currentTarget.value)
                }
                value={form.additionalInfo}
              />
            </div>
          </div>
        </Card>
        <aside className={styles.summary}>
          <Card>
            <h2>Payment Method</h2>
            <label className={styles.payment}>
              <input
                aria-label="Debit Card"
                checked
                name="paymentMethod"
                readOnly
                type="radio"
                value="stripe_debit_card"
              />
              <span>
                <strong>Debit Card</strong>
                <small>
                  Guest checkout uses Stripe debit card. No payment is taken on
                  this page.
                </small>
              </span>
            </label>
          </Card>
          <Card>
            <h2>Order Summary</h2>
            <dl className={styles.summaryDetails}>
              <div>
                <dt>Shipping</dt>
                <dd>€5.00</dd>
              </div>
              <div>
                <dt>Product subtotal and total</dt>
                <dd>Confirmed later</dd>
              </div>
            </dl>
            <p className={styles.muted}>
              This step only saves your private checkout draft.
            </p>
            <Button
              pending={saveState === 'saving'}
              pendingLabel="Saving checkout details…"
              type="submit"
            >
              Save checkout details
            </Button>
            {saveState === 'saved' ? (
              <p role="status">Checkout details saved privately.</p>
            ) : null}
            {saveState === 'unavailable' ? (
              <p role="alert">
                We couldn’t save your checkout details. Try again.
              </p>
            ) : null}
          </Card>
        </aside>
      </form>
    </section>
  );
}

function toSaveDraft(form: CheckoutForm): SaveCheckoutDraft {
  const optional = (value: string) => value.trim() || undefined;
  return {
    email: form.email,
    fullName: form.fullName,
    phoneNumber: form.phoneNumber,
    paymentMethod: 'stripe_debit_card',
    delivery: {
      countryCode: form.countryCode,
      city: form.city,
      street: form.street,
      postalCode: optional(form.postalCode),
      administrativeArea: optional(form.administrativeArea),
      houseNumber: optional(form.houseNumber),
      apartmentUnit: optional(form.apartmentUnit),
      floor: optional(form.floor),
      additionalInfo: optional(form.additionalInfo),
    },
  };
}

function formFromDraft(draft: CheckoutDraft): CheckoutForm {
  return {
    additionalInfo: draft.delivery.additionalInfo ?? '',
    administrativeArea: draft.delivery.administrativeArea ?? '',
    apartmentUnit: draft.delivery.apartmentUnit ?? '',
    city: draft.delivery.city,
    countryCode: draft.delivery.countryCode,
    email: draft.email,
    floor: draft.delivery.floor ?? '',
    fullName: draft.fullName,
    houseNumber: draft.delivery.houseNumber ?? '',
    phoneNumber: draft.phoneNumber,
    postalCode: draft.delivery.postalCode ?? '',
    street: draft.delivery.street,
  };
}

function createIdempotencyKey() {
  return `checkout-${crypto.randomUUID()}`;
}

function storeDraft(draft: SaveCheckoutDraft) {
  window.sessionStorage.setItem(DRAFT_HANDOFF_KEY, JSON.stringify(draft));
}

function clearStoredDraft() {
  window.sessionStorage.removeItem(DRAFT_HANDOFF_KEY);
}

function readStoredDraft(): SaveCheckoutDraft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_HANDOFF_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('delivery' in parsed) ||
      !('email' in parsed) ||
      !('fullName' in parsed) ||
      !('phoneNumber' in parsed) ||
      !('paymentMethod' in parsed)
    )
      return null;
    return parsed as SaveCheckoutDraft;
  } catch {
    return null;
  }
}

function formFromSaveDraft(draft: SaveCheckoutDraft): CheckoutForm {
  return {
    additionalInfo: draft.delivery.additionalInfo ?? '',
    administrativeArea: draft.delivery.administrativeArea ?? '',
    apartmentUnit: draft.delivery.apartmentUnit ?? '',
    city: draft.delivery.city,
    countryCode: draft.delivery.countryCode,
    email: draft.email,
    floor: draft.delivery.floor ?? '',
    fullName: draft.fullName,
    houseNumber: draft.delivery.houseNumber ?? '',
    phoneNumber: draft.phoneNumber,
    postalCode: draft.delivery.postalCode ?? '',
    street: draft.delivery.street,
  };
}
