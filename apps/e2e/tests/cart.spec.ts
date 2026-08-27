import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Request as PlaywrightRequest,
  type Route,
} from '@playwright/test';

import {
  qualityGates,
  viewportProbes,
} from '../../web/src/quality/acceptance-matrix';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('API-backed guest cart', () => {
  test.skip(unavailable, 'runs only against the connected cart API');

  test.afterEach(async ({ page }) => {
    await clearCart(page);
  });

  test('renders canonical cart changes after a fixture is seeded, then updates, removes, and clears through the provider', async ({
    page,
  }) => {
    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shopping Cart' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Your cart is empty' }),
    ).toBeVisible();

    await seedCartLine(page, 'citra-hops');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Citra Hops' }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Cart summary').getByText('US$5.99'),
    ).toBeVisible();

    await quantityForm(page, 'Citra Hops')
      .getByRole('button', { name: 'Increase weight amount' })
      .click();
    await page.getByRole('button', { name: 'Update Citra Hops' }).click();
    await expect(page.getByText('200g selected')).toBeVisible();
    await expect(
      page.getByLabel('Cart summary').getByText('US$11.98'),
    ).toBeVisible();

    await seedCartLine(page, 'mosaic-hops');
    await page.reload();
    await page
      .getByRole('button', { name: 'Remove Citra Hops from cart' })
      .click();
    await expect(page.getByRole('heading', { name: 'Citra Hops' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('heading', { name: 'Mosaic Hops' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Clear cart' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your cart is empty' }),
    ).toBeVisible();
  });

  test('keeps the populated cart responsive, keyboard-operable and free of blocking axe findings', async ({
    page,
  }) => {
    await seedCartLine(page, 'citra-hops');
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const { height, id, width } of viewportProbes) {
      await page.setViewportSize({ height, width });
      await page.goto('/cart');
      await expect(
        page.getByRole('heading', { name: 'Citra Hops' }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${id} cart horizontal overflow`).toBeLessThanOrEqual(
        qualityGates.overflow.maximumUnexpectedHorizontalOverflowCssPx,
      );
    }

    await page.setViewportSize({ height: 800, width: 360 });
    await page.goto('/cart');
    await assertReducedMotion(page, 'ready cart');
    const increase = quantityForm(page, 'Citra Hops').getByRole('button', {
      name: 'Increase weight amount',
    });
    await focusWithKeyboard(page, increase);
    await assertProjectFocusVisible(increase, 'increase cart amount');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Update Citra Hops' }).click();
    await expect(page.getByText('200g selected')).toBeVisible();

    await assertNoBlockingAxeViolations(page, 'ready cart');
  });

  test('has no blocking axe findings in empty and seeded-ready cart states', async ({
    page,
  }) => {
    await clearCart(page);
    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shopping Cart' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Your cart is empty' }),
    ).toBeVisible();
    await assertNoBlockingAxeViolations(page, 'empty cart');

    await seedCartLine(page, 'citra-hops');
    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { name: 'Citra Hops' }),
    ).toBeVisible();
    await assertNoBlockingAxeViolations(page, 'ready cart');
  });
});

test.describe('F3 cart reservations', () => {
  test('renders the Figma cart controls and a server-derived reservation countdown', async ({
    page,
  }) => {
    const activeCart = cartFixture({
      items: [
        cartLine({ name: 'Citra Hops', amount: 500_000 }),
        cartLine({
          name: 'Caramel Malt 60L',
          productSlug: 'caramel-malt-60l',
        }),
      ],
    });
    await interceptCart(page, activeCart);

    await page.goto('/cart');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Shopping Cart' }),
    ).toBeVisible();
    await expect(page.getByText('500g selected')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove Citra Hops from cart' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Proceed to Checkout' }),
    ).toHaveAttribute('href', '/checkout');
    await expectReservationCountdown(page);
  });

  test('keeps expired lines and offers one cart-wide availability recheck', async ({
    page,
  }) => {
    const expiredCart = cartFixture({
      checkoutEligible: false,
      items: [
        cartLine({
          name: 'Citra Hops',
          amount: 500_000,
          reservation: 'expired',
        }),
        cartLine({
          name: 'Caramel Malt 60L',
          productSlug: 'caramel-malt-60l',
          reservation: 'expired',
        }),
      ],
    });
    await interceptCart(page, expiredCart);

    await page.goto('/cart');

    await expect(
      page.getByRole('heading', { name: 'Citra Hops' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Caramel Malt 60L' }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Reservations expired. Recheck availability before checkout.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Recheck availability' }),
    ).toHaveCount(1);
    await expect(page.getByText('Out of stock', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText('Remove unavailable items before checkout.'),
    ).toHaveCount(0);
    await expect(
      page.getByText('Recheck availability before checkout.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Proceed to Checkout' }),
    ).toHaveCount(0);
  });

  test('uses the recheck response as authoritative without removing unavailable lines', async ({
    page,
  }) => {
    const expiredCart = cartFixture({
      checkoutEligible: false,
      items: [
        cartLine({
          name: 'Citra Hops',
          amount: 500_000,
          reservation: 'expired',
        }),
        cartLine({
          name: 'Caramel Malt 60L',
          productSlug: 'caramel-malt-60l',
          reservation: 'expired',
        }),
      ],
    });
    const recheckedCart = cartFixture({
      adjustmentMessage:
        'Citra Hops was adjusted to 3. Caramel Malt 60L is out of stock.',
      checkoutEligible: false,
      items: [
        cartLine({ name: 'Citra Hops', amount: 300_000 }),
        cartLine({
          availability: 'unavailable',
          name: 'Caramel Malt 60L',
          productSlug: 'caramel-malt-60l',
          reservation: 'unreserved',
        }),
      ],
    });
    await interceptCart(page, expiredCart, { recheck: recheckedCart });

    await page.goto('/cart');
    const recheckResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/cart/recheck') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Recheck availability' }).click();
    await recheckResponse;

    await expect(page.getByText('300g selected')).toBeVisible();
    await expectReservationCountdown(page);
    await expect(
      page.getByRole('status').filter({
        hasText:
          'Citra Hops was adjusted to 3. Caramel Malt 60L is out of stock.',
      }),
    ).toHaveText(
      'Citra Hops was adjusted to 3. Caramel Malt 60L is out of stock.',
    );
    await expect(
      page.getByRole('heading', { name: 'Caramel Malt 60L' }),
    ).toBeVisible();
    await expect(page.getByText('Out of stock', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Remove unavailable items before checkout.'),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Proceed to Checkout' }),
    ).toHaveCount(0);
  });

  test('keeps amount, remove, and clear controls keyboard-operable with canonical responses', async ({
    page,
  }) => {
    const initialCart = cartFixture({
      items: [
        cartLine({ name: 'Citra Hops' }),
        cartLine({ name: 'Mosaic Hops', productSlug: 'mosaic-hops' }),
      ],
    });
    const increasedCart = cartFixture({
      items: [
        cartLine({ name: 'Citra Hops', amount: 200_000 }),
        cartLine({ name: 'Mosaic Hops', productSlug: 'mosaic-hops' }),
      ],
    });
    const withoutCitraCart = cartFixture({
      items: [cartLine({ name: 'Mosaic Hops', productSlug: 'mosaic-hops' })],
    });
    const emptyCart = cartFixture({ checkoutEligible: false, items: [] });
    await interceptCart(page, initialCart, {
      clear: emptyCart,
      remove: withoutCitraCart,
      update: increasedCart,
    });

    await page.goto('/cart');

    const increase = quantityForm(page, 'Citra Hops').getByRole('button', {
      name: 'Increase weight amount',
    });
    await focusWithKeyboard(page, increase);
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Update Citra Hops' }).click();
    await expect(page.getByText('200g selected')).toBeVisible();

    const remove = page.getByRole('button', {
      name: 'Remove Citra Hops from cart',
    });
    await expect(remove).toBeEnabled();
    await focusWithKeyboard(page, remove);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Citra Hops' })).toHaveCount(
      0,
    );

    const clear = page.getByRole('button', { name: 'Clear cart' });
    await focusWithKeyboard(page, clear);
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Your cart is empty' }),
    ).toBeVisible();
  });
});

test.describe('cart unavailable state', () => {
  test.skip(!unavailable, 'runs only against the delayed unavailable API');

  test('shows a recoverable private-cart failure without exposing transport details', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.goto('/cart');
    const alert = page
      .getByRole('alert')
      .filter({ hasText: 'Your cart is unavailable' });
    await expect(alert).toContainText('Your cart is unavailable');
    await expect(alert).not.toContainText(/csrf|token|cookie|fetch|stack/i);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shopping Cart' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await assertNoBlockingAxeViolations(page, 'unavailable cart');
  });
});

type CartFixture = Readonly<{
  adjustmentMessage: string | null;
  checkoutEligible: boolean;
  currency: 'USD';
  distinctItemCount: number;
  items: CartFixtureItem[];
  serverNow: string;
  subtotalMinor: number;
}>;

type CartFixtureItem = Readonly<{
  availability: 'available' | 'unavailable';
  imagePath: string;
  lineTotalMinor: number | null;
  name: string;
  amount: number;
  amountUnit: 'MILLIGRAM' | 'EACH';
  saleKind: 'WEIGHT' | 'PACKAGE' | 'KIT';
  priceBasisAmount: number;
  minimumOrderAmount: number;
  orderStepAmount: number;
  maximumOrderAmount: number | null;
  stockAmount: number;
  packageNetWeightMg: number | null;
  kitYieldVolumeMl: number | null;
  priceMinor: number | null;
  priceQualifier: string;
  productId: string;
  productSlug: string;
  reservationExpiresAt: string | null;
  reservationStatus: 'active' | 'expired' | 'unreserved';
}>;

type CartFixtureHandlers = Readonly<
  Partial<{
    clear: CartFixture;
    recheck: CartFixture;
    remove: CartFixture;
    update: CartFixture;
  }>
>;

function cartFixture({
  adjustmentMessage = null,
  checkoutEligible = true,
  items,
}: Readonly<{
  adjustmentMessage?: string | null;
  checkoutEligible?: boolean;
  items: CartFixtureItem[];
}>): CartFixture {
  const now = new Date();
  return {
    adjustmentMessage,
    checkoutEligible,
    currency: 'USD',
    distinctItemCount: items.length,
    items,
    serverNow: now.toISOString(),
    subtotalMinor: items.reduce(
      (sum, item) => sum + (item.lineTotalMinor ?? 0),
      0,
    ),
  };
}

function cartLine({
  availability,
  amount = 100_000,
  name,
  productSlug = name.toLowerCase().replaceAll(' ', '-'),
  reservation = 'active',
}: Readonly<{
  availability?: 'available' | 'unavailable';
  amount?: number;
  name: string;
  productSlug?: string;
  reservation?: 'active' | 'expired' | 'unreserved';
}>): CartFixtureItem {
  const reservationExpiresAt =
    reservation === 'unreserved'
      ? null
      : new Date(
          Date.now() + (reservation === 'active' ? 15 * 60_000 : -1_000),
        ).toISOString();
  const resolvedAvailability =
    availability ?? (reservation === 'active' ? 'available' : 'unavailable');
  const priceMinor = 599;
  const priceBasisAmount = 100_000;
  return {
    availability: resolvedAvailability,
    imagePath: `/assets/products/${productSlug}.jpg`,
    lineTotalMinor:
      priceMinor === null
        ? null
        : Math.floor(
            (priceMinor * amount + priceBasisAmount / 2) / priceBasisAmount,
          ),
    name,
    amount,
    amountUnit: 'MILLIGRAM',
    saleKind: 'WEIGHT',
    priceBasisAmount,
    minimumOrderAmount: 100_000,
    orderStepAmount: 100_000,
    maximumOrderAmount: null,
    stockAmount: 100_000_000,
    packageNetWeightMg: null,
    kitYieldVolumeMl: null,
    priceMinor,
    priceQualifier: 'per 100g',
    productId: fixtureProductId(productSlug),
    productSlug,
    reservationExpiresAt,
    reservationStatus: reservation,
  };
}

function fixtureProductId(productSlug: string) {
  const ids: Record<string, string> = {
    'caramel-malt-60l': '10000000-0000-4000-8000-000000000002',
    'citra-hops': '10000000-0000-4000-8000-000000000001',
    'mosaic-hops': '10000000-0000-4000-8000-000000000003',
  };
  return ids[productSlug] ?? '10000000-0000-4000-8000-000000000099';
}

async function interceptCart(
  page: Page,
  initialCart: CartFixture,
  handlers: CartFixtureHandlers = {},
) {
  let canonicalCart = initialCart;
  const handleCartRequest = async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        headers: cartPreflightHeaders(request),
        status: 204,
      });
      return;
    }

    if (pathname.endsWith('/csrf') && request.method() === 'GET') {
      await route.fulfill({
        body: JSON.stringify({
          csrfToken: 'fixture.1234567890123456789012345678901234567890123',
        }),
        contentType: 'application/json',
        headers: privateCartHeaders(request),
      });
      return;
    }

    if (pathname.endsWith('/recheck') && request.method() === 'POST') {
      canonicalCart = handlers.recheck ?? canonicalCart;
      await fulfillCart(route, canonicalCart);
      return;
    }

    if (pathname.endsWith('/items') && request.method() === 'DELETE') {
      canonicalCart = handlers.clear ?? canonicalCart;
      await fulfillCart(route, canonicalCart);
      return;
    }

    if (pathname.includes('/items/') && request.method() === 'DELETE') {
      canonicalCart = handlers.remove ?? canonicalCart;
      await fulfillCart(route, canonicalCart);
      return;
    }

    if (pathname.includes('/items/') && request.method() === 'PATCH') {
      canonicalCart = handlers.update ?? canonicalCart;
      await fulfillCart(route, canonicalCart);
      return;
    }

    if (pathname.endsWith('/cart') && request.method() === 'GET') {
      await fulfillCart(route, canonicalCart);
      return;
    }

    await route.fallback();
  };

  await page.route('**/api/v1/cart', handleCartRequest);
  await page.route('**/api/v1/cart/**', handleCartRequest);
}

function privateCartHeaders(request: PlaywrightRequest) {
  return {
    ...cartCorsHeaders(request),
    'cache-control': 'private, no-store',
  };
}

function cartPreflightHeaders(request: PlaywrightRequest) {
  const requestedHeaders = request.headers()['access-control-request-headers'];
  return {
    ...cartCorsHeaders(request),
    'access-control-allow-headers':
      requestedHeaders ?? 'content-type, x-csrf-token',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

function cartCorsHeaders(request: PlaywrightRequest) {
  const origin = request.headers().origin;
  return origin
    ? {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': origin,
        vary: 'Origin',
      }
    : {};
}

async function fulfillCart(route: Route, cart: CartFixture) {
  await route.fulfill({
    body: JSON.stringify(cart),
    contentType: 'application/json',
    headers: privateCartHeaders(route.request()),
  });
}

async function expectReservationCountdown(page: Page) {
  const countdown = page.getByText(/^Reservations expire in 1[45]:[0-5]\d$/);
  await expect(countdown).toHaveCount(1);
  await expect(countdown).toBeVisible();
}

function quantityForm(page: Page, productName: string) {
  return page.locator('form').filter({
    has: page.getByRole('button', { name: `Update ${productName}` }),
  });
}

async function seedCartLine(page: Page, productSlug: string) {
  await page.goto('/cart');
  const response = await page.evaluate(async (slug) => {
    const apiUrl = `http://${window.location.hostname}:3001/api/v1`;
    const csrf = await fetch(`${apiUrl}/cart/csrf`, {
      credentials: 'include',
    });
    const csrfBody = csrf.ok
      ? ((await csrf.json()) as { csrfToken: string })
      : null;
    const add = await fetch(`${apiUrl}/cart/items`, {
      body: JSON.stringify({ amount: 100_000, productSlug: slug }),
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(csrfBody ? { 'x-csrf-token': csrfBody.csrfToken } : {}),
      },
      method: 'POST',
    });
    return { ok: add.ok, status: add.status };
  }, productSlug);
  expect(response).toEqual({ ok: true, status: 200 });
}

async function assertNoBlockingAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
    `${label} Axe results`,
  ).toEqual([]);
}

async function focusWithKeyboard(page: Page, target: Locator) {
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('Tab');
    if (
      await target.evaluate((element) => document.activeElement === element)
    ) {
      return;
    }
  }
  throw new Error('Keyboard focus did not reach the requested cart control.');
}

async function assertProjectFocusVisible(target: Locator, label: string) {
  const outline = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      widthCssPx: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(outline.style, `${label} outline style`).toBe('solid');
  expect(outline.widthCssPx, `${label} outline width`).toBeGreaterThanOrEqual(
    qualityGates.focus.minimumIndicatorThicknessCssPx,
  );
}

async function assertReducedMotion(page: Page, label: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    )
    .toBe(true);

  const cart = page.locator('section[aria-labelledby="cart-title"]').first();
  await expect(cart, `${label} container`).toBeVisible();
  const motion = await cart.evaluate((element) => ({
    animationDuration: getComputedStyle(element).animationDuration,
    animationName: getComputedStyle(element).animationName,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionDuration: getComputedStyle(element).transitionDuration,
  }));
  expect(motion, `${label} reduced motion`).toEqual({
    animationDuration: '1e-05s',
    animationName: 'none',
    scrollBehavior: qualityGates.reducedMotion.scrollBehavior,
    transitionDuration: '0s',
  });
}

async function clearCart(page: Page) {
  await page
    .evaluate(async () => {
      const apiUrl = `http://${window.location.hostname}:3001/api/v1`;
      const csrf = await fetch(`${apiUrl}/cart/csrf`, {
        credentials: 'include',
      });
      if (!csrf.ok) return;
      const { csrfToken } = (await csrf.json()) as { csrfToken: string };
      await fetch(`${apiUrl}/cart/items`, {
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken },
        method: 'DELETE',
      });
    })
    .catch(() => undefined);
}
