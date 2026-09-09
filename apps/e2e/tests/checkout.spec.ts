import { expect, test, type Page, type Route } from '@playwright/test';

const csrfToken = `v1.${'A'.repeat(43)}`;

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
    await expect(page.getByText('€5.00')).toBeVisible();
    await expect(page.getByText('Confirmed later')).toBeVisible();
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
  await interceptSuccessfulLogin(page, cartMerge);

  await page.goto('/checkout');
  await fillCheckoutDraft(page);
  await page.getByRole('button', { name: 'Save checkout details' }).click();
  await expect(
    page.getByText('Checkout details saved privately.'),
  ).toBeVisible();

  api.markAuthTransition();
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
      sessionStorage.getItem('hb-checkout-draft-handoff-v1'),
    ),
  ).toBeNull();
}

async function interceptSuccessfulLogin(page: Page, cartMerge: string) {
  await page.route('**/api/v1/auth/login', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfill(route, undefined, 204);
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ cartMerge }),
      contentType: 'application/json',
      headers: privateHeaders(route),
    });
  });
}

async function interceptCheckoutDraft(
  page: Page,
  options: Readonly<{ requireAdoption?: boolean }> = {},
) {
  let saved: Record<string, unknown> | null = null;
  let authTransition = false;
  let awaitingAdoption = false;
  let adoptions = 0;
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
      await fulfill(route, draftResponse(saved));
      return;
    }
    saved = request.postDataJSON() as Record<string, unknown>;
    if (awaitingAdoption) {
      awaitingAdoption = false;
      adoptions += 1;
    }
    await fulfill(route, draftResponse(saved));
  });
  return {
    get adoptions() {
      return adoptions;
    },
    get saved() {
      return saved;
    },
    markAuthTransition() {
      authTransition = true;
    },
  };
}

function draftResponse(saved: Record<string, unknown>) {
  return {
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
    status: 'pre_payment',
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
