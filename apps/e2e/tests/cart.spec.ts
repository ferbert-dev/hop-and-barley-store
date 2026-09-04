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
const connectedApiUrl = process.env.E2E_API_URL ?? null;
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
      page.getByLabel('Cart summary').getByText('€5.99'),
    ).toBeVisible();

    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/cart/items/') &&
        response.request().method() === 'PATCH',
    );
    await quantityForm(page, 'Citra Hops')
      .getByRole('button', { name: 'Increase weight amount' })
      .click();
    await updateResponse;
    await expect(
      quantityForm(page, 'Citra Hops').getByLabel('Quantity'),
    ).toHaveValue('0.2');
    await expect(
      page.getByLabel('Cart summary').getByText('€11.98'),
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
    const keyboardUpdateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/cart/items/') &&
        response.request().method() === 'PATCH',
    );
    await page.keyboard.press('Enter');
    await keyboardUpdateResponse;
    await expect(
      quantityForm(page, 'Citra Hops').getByLabel('Quantity'),
    ).toHaveValue('0.2');

    const quantityInput = quantityForm(page, 'Citra Hops').getByLabel(
      'Quantity',
    );
    await quantityInput.fill('0.4');
    const directUpdateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/cart/items/') &&
        response.request().method() === 'PATCH',
    );
    await quantityInput.press('Enter');
    await directUpdateResponse;
    await expect(quantityInput).toHaveValue('0.4');

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

test.describe('O2S advisory checkout readiness', () => {
  test('checks once with a stable pending label, then hands a ready cart to checkout', async ({
    page,
  }) => {
    const cart = cartFixture({
      items: [cartLine({ name: 'Citra Hops', amount: 500_000 })],
    });
    await interceptCart(page, cart, {
      readiness: readinessFixture('ready', cart.items),
    });

    await page.goto('/cart');
    const checkout = page.getByRole('button', { name: 'Proceed to Checkout' });
    const readinessRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith('/api/v1/cart/checkout-readiness') &&
        request.method() === 'POST',
    );
    await checkout.click();
    await expect(
      page.getByRole('button', { name: 'Checking availability…' }),
    ).toBeVisible();
    await readinessRequest;
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('keeps every line and control when readiness identifies multiple failures', async ({
    page,
  }) => {
    const cart = cartFixture({
      items: [
        cartLine({ name: 'Citra Hops', amount: 500_000 }),
        cartLine({ name: 'Mosaic Hops', productSlug: 'mosaic-hops' }),
        cartLine({
          name: 'Caramel Malt 60L',
          productSlug: 'caramel-malt-60l',
        }),
      ],
    });
    await interceptCart(page, cart, {
      readiness: readinessFixture('unavailable', cart.items, {
        'caramel-malt-60l': 'product_unavailable',
        'citra-hops': 'insufficient_stock',
      }),
    });

    await page.goto('/cart');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();

    await expect(page).toHaveURL(/\/cart$/);
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Availability needs attention' }),
    ).toBeVisible();
    const citraLine = page
      .getByRole('heading', { name: 'Citra Hops' })
      .locator('xpath=ancestor::div[.//form][1]');
    await expect(
      citraLine.getByText('This amount is not currently available.'),
    ).toBeVisible();
    const caramelLine = page
      .getByRole('heading', { name: 'Caramel Malt 60L' })
      .locator('xpath=ancestor::div[.//form][1]');
    await expect(
      caramelLine.getByText('This item is no longer available.'),
    ).toBeVisible();
    await expect(
      quantityForm(page, 'Mosaic Hops').getByLabel('Quantity'),
    ).toBeEnabled();
    await expect(
      quantityForm(page, 'Citra Hops').getByRole('button', {
        name: 'Increase weight amount',
      }),
    ).toBeEnabled();
    await expect(page.getByText(/reservation|recheck/i)).toHaveCount(0);
  });

  test('keeps independent 0.1 kg weight lines and allows one line at 100 kg without an aggregate cap', async ({
    page,
  }) => {
    const cart = cartFixture({
      items: [
        cartLine({ name: 'Citra Hops', amount: 100_000 }),
        cartLine({ name: 'Mosaic Hops', productSlug: 'mosaic-hops' }),
      ],
    });
    const afterCitraUpdate = cartFixture({
      items: [
        cartLine({ name: 'Citra Hops', amount: 100_000_000 }),
        cartLine({ name: 'Mosaic Hops', productSlug: 'mosaic-hops' }),
      ],
    });
    await interceptCart(page, cart, { update: afterCitraUpdate });

    await page.goto('/cart');
    const citraAmount = quantityForm(page, 'Citra Hops').getByLabel('Quantity');
    await citraAmount.fill('100');
    const updateRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/api/v1/cart/items/citra-hops') &&
        request.method() === 'PATCH',
    );
    await citraAmount.press('Enter');
    expect((await updateRequest).postDataJSON()).toEqual({
      amount: 100_000_000,
    });
    await expect(citraAmount).toHaveValue('100');
    await expect(
      quantityForm(page, 'Mosaic Hops').getByLabel('Quantity'),
    ).toHaveValue('0.1');
  });

  test('uses the restored primary action to recover from a generic readiness transport failure', async ({
    page,
  }) => {
    const cart = cartFixture({
      items: [cartLine({ name: 'Citra Hops' })],
    });
    await interceptCart(page, cart, {
      readiness: readinessFixture('ready', cart.items),
      readinessFailures: 1,
    });

    await page.goto('/cart');
    const checkout = page.getByRole('button', { name: 'Proceed to Checkout' });
    await checkout.click();
    const alert = page
      .getByRole('alert')
      .filter({ hasText: 'We couldn’t check availability. Try again.' });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(/csrf|token|cookie|fetch|stack/i);
    await expect(checkout).toBeEnabled();

    const retryRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith('/api/v1/cart/checkout-readiness') &&
        request.method() === 'POST',
    );
    await checkout.click();
    await retryRequest;
    await expect(page).toHaveURL(/\/checkout$/);
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
    const emptyCart = cartFixture({ items: [] });
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
    await expect(
      quantityForm(page, 'Citra Hops').getByLabel('Quantity'),
    ).toHaveValue('0.2');

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
  currency: 'EUR';
  distinctItemCount: number;
  items: CartFixtureItem[];
  subtotalMinor: number;
}>;

type CartFixtureItem = Readonly<{
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
}>;

type CheckoutReadinessFixture = Readonly<{
  checkedAt: string;
  lines: ReadonlyArray<
    Readonly<{
      outcome:
        | 'available'
        | 'insufficient_stock'
        | 'product_unavailable'
        | 'invalid_amount'
        | 'price_unavailable';
      productSlug: string;
      requestedAmount: number;
    }>
  >;
  status: 'ready' | 'empty' | 'unavailable';
}>;

type CartFixtureHandlers = Readonly<
  Partial<{
    clear: CartFixture;
    remove: CartFixture;
    readiness: CheckoutReadinessFixture;
    readinessFailures: number;
    update: CartFixture;
  }>
>;

function cartFixture({
  items,
}: Readonly<{ items: CartFixtureItem[] }>): CartFixture {
  return {
    currency: 'EUR',
    distinctItemCount: items.length,
    items,
    subtotalMinor: items.reduce(
      (sum, item) => sum + (item.lineTotalMinor ?? 0),
      0,
    ),
  };
}

function cartLine({
  amount = 100_000,
  name,
  productSlug = name.toLowerCase().replaceAll(' ', '-'),
}: Readonly<{
  amount?: number;
  name: string;
  productSlug?: string;
}>): CartFixtureItem {
  const priceMinor = 599;
  const priceBasisAmount = 100_000;
  const imagePathBySlug: Readonly<Record<string, string>> = {
    'caramel-malt-60l': '/assets/products/caramel-malt.webp',
  };
  return {
    imagePath:
      imagePathBySlug[productSlug] ?? `/assets/products/${productSlug}.webp`,
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
  };
}

function readinessFixture(
  status: CheckoutReadinessFixture['status'],
  items: readonly CartFixtureItem[],
  overrides: Readonly<
    Partial<
      Record<string, CheckoutReadinessFixture['lines'][number]['outcome']>
    >
  > = {},
): CheckoutReadinessFixture {
  return {
    checkedAt: '2026-08-27T12:00:00.000Z',
    lines:
      status === 'empty'
        ? []
        : items.map((item) => ({
            outcome: overrides[item.productSlug] ?? 'available',
            productSlug: item.productSlug,
            requestedAmount: item.amount,
          })),
    status,
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
  let readinessFailuresRemaining = handlers.readinessFailures ?? 0;
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

    if (
      pathname.endsWith('/checkout-readiness') &&
      request.method() === 'POST'
    ) {
      if (readinessFailuresRemaining > 0) {
        readinessFailuresRemaining -= 1;
        await route.fulfill({
          contentType: 'application/json',
          headers: privateCartHeaders(request),
          status: 503,
        });
        return;
      }
      await fulfillReadiness(
        route,
        handlers.readiness ?? readinessFixture('empty', []),
      );
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

async function fulfillReadiness(
  route: Route,
  readiness: CheckoutReadinessFixture,
) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  await route.fulfill({
    body: JSON.stringify(readiness),
    contentType: 'application/json',
    headers: privateCartHeaders(route.request()),
  });
}

function quantityForm(page: Page, productName: string) {
  return page.getByRole('form', {
    name: `${productName} quantity`,
  });
}

async function seedCartLine(page: Page, productSlug: string) {
  await page.goto('/cart');
  const response = await page.evaluate(
    async ({ apiUrl, slug }) => {
      const resolvedApiUrl =
        apiUrl ?? `http://${window.location.hostname}:3001/api/v1`;
      const csrf = await fetch(`${resolvedApiUrl}/cart/csrf`, {
        credentials: 'include',
      });
      const csrfBody = csrf.ok
        ? ((await csrf.json()) as { csrfToken: string })
        : null;
      const add = await fetch(`${resolvedApiUrl}/cart/items`, {
        body: JSON.stringify({ amount: 100_000, productSlug: slug }),
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(csrfBody ? { 'x-csrf-token': csrfBody.csrfToken } : {}),
        },
        method: 'POST',
      });
      return { ok: add.ok, status: add.status };
    },
    { apiUrl: connectedApiUrl, slug: productSlug },
  );
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
  for (let index = 0; index < 64; index += 1) {
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
    .evaluate(async (apiUrl) => {
      const resolvedApiUrl =
        apiUrl ?? `http://${window.location.hostname}:3001/api/v1`;
      const csrf = await fetch(`${resolvedApiUrl}/cart/csrf`, {
        credentials: 'include',
      });
      if (!csrf.ok) return;
      const { csrfToken } = (await csrf.json()) as { csrfToken: string };
      await fetch(`${resolvedApiUrl}/cart/items`, {
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken },
        method: 'DELETE',
      });
    }, connectedApiUrl)
    .catch(() => undefined);
}
