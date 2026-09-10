import { expect, test, type Page, type Route } from '@playwright/test';

const csrfToken = `v1.${'A'.repeat(43)}`;
const handoffKey = 'hb-checkout-draft-handoff-v2';

test.describe('O2G private checkout draft', () => {
  test('shows guest and auth entry, structured delivery fields, fixed shipping, and a draft save/reload', async ({
    page,
  }) => {
    const api = await interceptCheckoutDraft(page);

    await page.goto('/checkout');
    await expect(page.getByText('Checkout as a guest')).toBeVisible();
    await expect(
      page.getByLabel('Checkout').getByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/login?next=%2Fcheckout');
    await expect(
      page.getByRole('link', { name: 'create an account' }),
    ).toHaveAttribute('href', '/register?next=%2Fcheckout');
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Country (ISO code)')).toBeVisible();
    await expect(page.getByLabel('Delivery notes')).toBeVisible();
    await expect(
      page.getByText(
        'Save your checkout details to receive the current order quote.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay' })).toHaveCount(0);

    await fillCheckoutDraft(page);
    await page.getByRole('button', { name: 'Save checkout details' }).click();
    await expect(
      page.getByText('Checkout details saved privately.'),
    ).toBeVisible();
    expect(api.saved).toMatchObject({
      delivery: { city: 'Berlin', countryCode: 'DE', postalCode: '10115' },
      email: 'brewer@example.com',
      paymentMethod: 'stripe_debit_card',
    });

    await page.reload();
    await expect(page.getByLabel('Full Name')).toHaveValue('Alex Brewer');
    await expect(page.getByLabel('Postal code')).toHaveValue('10115');
  });

  test('preserves the unchanged draft through sign-in without an existing account cart', async ({
    page,
  }) => preserveDraftThroughSignIn(page, 'not_needed'));

  test('preserves the unchanged draft through sign-in with an existing account cart merge', async ({
    page,
  }) => preserveDraftThroughSignIn(page, 'succeeded'));

  test('renders the server-owned 6% products discount separately from shipping', async ({
    page,
  }) => {
    await interceptCheckoutDraft(page, { discounted: true });
    await page.goto('/checkout');
    await expect(
      page.getByText(/Eligible registered customers receive 6% off products/),
    ).toBeVisible();
    await fillCheckoutDraft(page);
    await page.getByRole('button', { name: 'Save checkout details' }).click();
    await expect(
      page.getByText('First purchase account discount (6%)'),
    ).toBeVisible();
    await expect(page.getByText('€100.00')).toBeVisible();
    await expect(page.getByText('€6.00')).toBeVisible();
    await expect(page.getByText('€5.00')).toBeVisible();
    await expect(page.getByText('€99.00')).toBeVisible();
  });
});

async function fillCheckoutDraft(page: Page) {
  await page.getByLabel('Full Name').fill('Alex Brewer');
  await page.getByLabel('Email').fill('brewer@example.com');
  await page.getByLabel('Phone number').fill('+4912345678');
  await page.getByLabel('Street').fill('Hopfenstraße');
  await page.getByLabel('City').fill('Berlin');
  await page.getByLabel('Postal code').fill('10115');
}

async function preserveDraftThroughSignIn(page: Page, cartMerge: string) {
  const api = await interceptCheckoutDraft(page, { requireAdoption: true });
  await interceptSuccessfulLogin(page, cartMerge, api.markAuthTransition);

  await page.goto('/checkout');
  await fillCheckoutDraft(page);
  await page.getByRole('button', { name: 'Save checkout details' }).click();
  await expect(
    page.getByText('Checkout details saved privately.'),
  ).toBeVisible();

  await page
    .getByLabel('Checkout')
    .getByRole('link', { name: 'Sign in' })
    .click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  await page.getByLabel('Email').fill('brewer@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Abcdefghi1!x');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByLabel('Full Name')).toHaveValue('Alex Brewer');
  await expect.poll(() => api.adoptions).toBe(1);
  expect(api.saved).toMatchObject({
    delivery: { city: 'Berlin', countryCode: 'DE', street: 'Hopfenstraße' },
    fullName: 'Alex Brewer',
  });
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('hb-checkout-draft-handoff-v2'),
    ),
  ).toBeNull();
}

test.describe('O2G handoff cleanup', () => {
  test('clears malformed and expired handoffs without reposting their PII', async ({
    page,
  }) => {
    for (const value of [
      '{not-json',
      JSON.stringify({
        draft: {
          delivery: {
            city: 'Berlin',
            countryCode: 'DE',
            street: 'Hopfenstraße',
          },
          email: 'brewer@example.com',
          fullName: 'Alex Brewer',
          phoneNumber: '+4912345678',
        },
        expiresAt: '2026-09-09T10:00:00.000Z',
        issuedAt: '2026-09-08T10:00:00.000Z',
        version: 2,
      }),
    ]) {
      await page.addInitScript(
        ({ key, stored }) => sessionStorage.setItem(key, stored),
        { key: handoffKey, stored: value },
      );
      const api = await interceptCheckoutDraft(page);
      await page.goto('/checkout');
      await page
        .getByLabel('Checkout')
        .getByRole('link', { name: 'Sign in' })
        .waitFor();
      expect(
        await page.evaluate((key) => sessionStorage.getItem(key), handoffKey),
      ).toBeNull();
      expect(api.posts).toBe(0);
    }
  });

  test('clears handoff data if auth-transition adoption fails', async ({
    page,
  }) => {
    const api = await interceptCheckoutDraft(page, {
      failAdoption: true,
      requireAdoption: true,
    });
    await interceptSuccessfulLogin(page, 'succeeded', api.markAuthTransition);
    await page.goto('/checkout');
    await fillCheckoutDraft(page);
    await page.getByRole('button', { name: 'Save checkout details' }).click();
    await expect(
      page.getByText('Checkout details saved privately.'),
    ).toBeVisible();
    await page
      .getByLabel('Checkout')
      .getByRole('link', { name: 'Sign in' })
      .click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
    await page.getByLabel('Email').fill('brewer@example.com');
    await page.getByLabel('Password', { exact: true }).fill('Abcdefghi1!x');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect
      .poll(() =>
        page.evaluate((key) => sessionStorage.getItem(key), handoffKey),
      )
      .toBeNull();
    expect(api.posts).toBe(2);
  });
});

async function interceptSuccessfulLogin(
  page: Page,
  cartMerge: string,
  markAuthTransition: () => void,
) {
  await page.route('**/api/v1/auth/login', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfill(route, undefined, 204);
      return;
    }
    markAuthTransition();
    await route.fulfill({
      body: JSON.stringify({ cartMerge }),
      contentType: 'application/json',
      headers: privateHeaders(route),
    });
  });
}

async function interceptCheckoutDraft(
  page: Page,
  options: Readonly<{
    discounted?: boolean;
    failAdoption?: boolean;
    requireAdoption?: boolean;
  }> = {},
) {
  let saved: Record<string, unknown> | null = null;
  let authTransition = false;
  let awaitingAdoption = false;
  let adoptions = 0;
  let posts = 0;
  await page.route('**/api/v1/cart/csrf', (route) =>
    fulfill(route, { csrfToken }),
  );
  await page.route('**/api/v1/checkout/draft', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await fulfill(route, undefined, 204);
      return;
    }
    if (request.method() === 'GET') {
      if (options.requireAdoption && authTransition) {
        authTransition = false;
        awaitingAdoption = true;
        await fulfill(route, undefined, 401);
        return;
      }
      if (!saved) {
        await fulfill(route, undefined, 404);
        return;
      }
      await fulfill(route, draftResponse(saved, options.discounted));
      return;
    }
    saved = request.postDataJSON() as Record<string, unknown>;
    posts += 1;
    if (awaitingAdoption) {
      awaitingAdoption = false;
      adoptions += 1;
    }
    if (options.failAdoption && adoptions === 1) {
      await fulfill(route, undefined, 503);
      return;
    }
    await fulfill(route, draftResponse(saved, options.discounted));
  });
  return {
    get adoptions() {
      return adoptions;
    },
    get saved() {
      return saved;
    },
    get posts() {
      return posts;
    },
    markAuthTransition() {
      authTransition = true;
    },
  };
}

function draftResponse(saved: Record<string, unknown>, discounted = false) {
  return {
    currency: 'EUR',
    discountBasisPoints: discounted ? 600 : 0,
    discountMinor: discounted ? 600 : 0,
    discountPolicyVersion: discounted
      ? 'registered-first-purchase-v1'
      : 'no-discount-v1',
    itemSubtotalMinor: discounted ? 10_000 : 599,
    ...saved,
    delivery: {
      additionalInfo: null,
      administrativeArea: null,
      apartmentUnit: null,
      floor: null,
      houseNumber: null,
      postalCode: null,
      ...(saved.delivery as Record<string, unknown>),
    },
    expiresAt: null,
    quoteStatus: 'ready',
    quotedAt: '2026-09-10T10:00:00.000Z',
    status: 'pre_payment',
    shippingMinor: 500,
    totalMinor: discounted ? 9_900 : 1099,
    updatedAt: '2026-09-09T10:00:00.000Z',
  };
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill(
    body === undefined
      ? {
          contentType: 'application/json',
          headers: privateHeaders(route),
          status,
        }
      : {
          body: JSON.stringify(body),
          contentType: 'application/json',
          headers: privateHeaders(route),
          status,
        },
  );
}

function privateHeaders(route: Route) {
  const origin = route.request().headers().origin ?? 'http://localhost:3000';
  return {
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers':
      'content-type, idempotency-key, origin, x-csrf-token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-origin': origin,
    'cache-control': 'private, no-store',
    vary: 'Cookie, Origin',
  };
}
