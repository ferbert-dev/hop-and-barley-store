import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { productAssetsBySlug } from '../../web/src/design-system/assets';
import {
  qualityGates,
  viewportProbes,
} from '../../web/src/quality/acceptance-matrix';
import {
  startCatalogCacheRuntime,
  type CatalogCacheRuntime,
} from '../support/catalog-cache-runtime';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.use({ screenshot: 'off', trace: 'off' });

test.describe('database-backed product details', () => {
  test.skip(unavailable, 'requires the connected API');

  test('opens every seeded product through one shared server-rendered template', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('status').first()).toHaveText('API connected');

    const productLinks = page.getByRole('article').getByRole('link');
    await expect(productLinks).toHaveCount(12);
    const products = await productLinks.evaluateAll((links) =>
      links.map((link) => ({
        href: link.getAttribute('href'),
        name: link.textContent?.trim(),
      })),
    );
    expect(new Set(products.map(({ href }) => href)).size).toBe(12);
    const expectedSlugs = Object.keys(productAssetsBySlug).sort();
    const visitedSlugs: string[] = [];
    let specificationTermCount = 0;

    for (const { href, name } of products) {
      expect(href).toMatch(/^\/product\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(name).toBeTruthy();
      if (!href || !name) throw new TypeError('Product link is incomplete');
      const slug = href.replace('/product/', '');
      visitedSlugs.push(slug);
      await page.goto(href, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      await expect(
        page.getByRole('link', {
          name: /^Shopping cart, \d+ items?$/,
        }),
      ).toBeVisible();
      const specifications = page
        .getByText('Technical Specifications', { exact: true })
        .first();
      await expect(specifications).toBeVisible();
      await expect(specifications.locator('..')).toHaveAttribute('open', '');
      const productImage = page.getByRole('main').getByRole('img');
      await expect(productImage).toHaveCount(1);
      await expect(productImage).toBeVisible();
      await expect
        .poll(() => localProductImagePath(productImage))
        .toBe(
          productAssetsBySlug[slug as keyof typeof productAssetsBySlug].src,
        );
      specificationTermCount += await page.getByRole('term').count();
      await expect(
        page.getByRole('button', { name: 'Add to Cart' }),
      ).toHaveCount(1);
      await expect(page.getByRole('heading', { name: /reviews/i })).toHaveCount(
        0,
      );
    }

    expect(visitedSlugs.sort()).toEqual(expectedSlugs);
    expect(specificationTermCount).toBe(95);
  });

  test('renders metadata, ordered specifications, not-found and accessible product UI', async ({
    page,
  }) => {
    await page.goto('/product/citra-hops');
    await expect(page).toHaveTitle('Citra Hops | Hop & Barley');
    await expect(page.getByText('In stock')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Add to Cart' }),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByText('US$5.99', { exact: true }).first(),
    ).toBeVisible();
    const specificationTerms = page.getByRole('term');
    expect(await specificationTerms.allTextContents()).toEqual([
      'Origin',
      'Type',
      'Alpha Acids',
      'Beta Acids',
      'Aroma Profile',
      'Usage',
      'Recommended Beer Styles',
    ]);
    await assertNoBlockingAxeViolations(page, 'in-stock product detail');

    await page.goto('/product/not-a-public-product');
    await expect(
      page.getByRole('heading', { name: 'Product not found' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to products' }),
    ).toHaveAttribute('href', '/');
  });

  test('adds as a guest, updates quantity, and preserves the cart after reload', async ({
    page,
  }) => {
    await clearGuestCart(page);
    try {
      await page.goto('/product/mosaic-hops');

      const addRequest = page.waitForRequest(
        (request) =>
          request.url().endsWith('/api/v1/cart/items') &&
          request.method() === 'POST',
      );
      await page.getByRole('button', { name: 'Add to Cart' }).click();
      const request = await addRequest;
      expect(request.postDataJSON()).toEqual({
        productSlug: 'mosaic-hops',
        quantity: 1,
      });
      await expect(
        page.getByLabel('Quantity for Mosaic Hops').getByRole('status'),
      ).toHaveText('1 in cart');
      await expect(
        page.getByRole('link', { name: 'Shopping cart, 1 item' }),
      ).toHaveAttribute('href', '/cart');

      await page
        .getByRole('button', { name: 'Increase Mosaic Hops quantity' })
        .click();
      await expect(
        page.getByLabel('Quantity for Mosaic Hops').getByRole('status'),
      ).toHaveText('2 in cart');
      await expect(
        page.getByRole('link', { name: 'Shopping cart, 2 items' }),
      ).toBeVisible();

      await page.reload();
      await expect(
        page.getByLabel('Quantity for Mosaic Hops').getByRole('status'),
      ).toHaveText('2 in cart');
    } finally {
      await clearGuestCart(page);
    }
  });

  test('reflows product detail without horizontal overflow at every approved probe', async ({
    page,
  }) => {
    test.slow();

    for (const { height, id, width } of viewportProbes) {
      await page.setViewportSize({ height, width });
      await page.goto('/product/citra-hops', {
        waitUntil: 'domcontentloaded',
      });
      await expect(
        page.getByRole('heading', { name: 'Citra Hops' }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${id} horizontal overflow`).toBeLessThanOrEqual(1);
      const breadcrumb = await page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: 'Products' })
        .boundingBox();
      expect(
        breadcrumb?.height,
        `${id} breadcrumb height`,
      ).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('isolated product-detail states', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(unavailable, 'runs once in the connected phase');
  let runtime: CatalogCacheRuntime;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    runtime = await startCatalogCacheRuntime();
  });

  test.beforeEach(async ({ page }) => {
    await interceptEmptyCart(page);
  });

  test.afterAll(async () => {
    await runtime?.stop();
  });

  test('renders product, not-found and safe API-error states', async ({
    page,
  }) => {
    await page.goto(`${runtime.baseUrl}/product/citra-hops`);
    await expect(page).toHaveTitle('Citra Hops | Hop & Barley');
    await expect(page.getByText('Out of stock').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add to Cart' }).first(),
    ).toBeDisabled();
    await expect(
      page
        .locator('main [aria-live="polite"]')
        .filter({ hasText: 'Viewing Citra Hops' }),
    ).toHaveText('Viewing Citra Hops');
    await expect(page.getByText(/stock quantity/i)).toHaveCount(0);

    await page.goto(`${runtime.baseUrl}/product/missing-product`);
    await expect(page).toHaveTitle('Product not found | Hop & Barley');
    await expect(
      page.getByRole('heading', { name: 'Product not found' }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Product not found' }),
    ).toHaveAttribute('aria-live', 'polite');

    await page.goto(`${runtime.baseUrl}/product/detail-error`);
    await expect(page).toHaveTitle('Product unavailable | Hop & Barley');
    await expect(
      page.getByRole('heading', { name: 'Product details unavailable' }),
    ).toBeVisible();
    const error = page
      .getByRole('alert')
      .filter({ hasText: 'Product details unavailable' });
    await expect(error).toHaveAttribute('aria-live', 'assertive');
    await expect(
      error.getByRole('button', { name: 'Try again' }),
    ).toBeVisible();
  });

  test('streams the loading state during client navigation and resolves ready', async ({
    page,
  }) => {
    await page.goto(runtime.baseUrl);
    const routeAnnouncer = page
      .locator('next-route-announcer')
      .locator('[role="alert"]');
    await expect(routeAnnouncer).toHaveAttribute('aria-live', 'assertive');
    await page.locator('a[href="/product/mosaic-hops"]').first().click();
    await expect(
      page.getByRole('heading', { name: 'Loading product details' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Mosaic Hops' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Mosaic Hops | Hop & Barley');
    const productAnnouncement = page
      .locator('main [aria-live="polite"]')
      .filter({ hasText: 'Viewing Mosaic Hops' });
    await expect(productAnnouncement).toHaveText('Viewing Mosaic Hops');
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Products' })
      .click();
    await expect(page).toHaveTitle('Shop brewing ingredients | Hop & Barley');
    await expect(routeAnnouncer).toHaveText(
      'Shop brewing ingredients | Hop & Barley',
    );
    await page.locator('a[href="/product/mosaic-hops"]').first().click();
    await expect(page).toHaveTitle('Mosaic Hops | Hop & Barley');
    await expect(productAnnouncement).toHaveText('Viewing Mosaic Hops');
  });

  test('covers responsive, Axe and reduced-motion semantics in every isolated state', async ({
    page,
  }) => {
    test.slow();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const probe of viewportProbes) {
      await page.setViewportSize({ width: probe.width, height: probe.height });
      for (const state of [
        {
          heading: 'Mosaic Hops',
          label: 'ready-in-stock',
          url: `${runtime.baseUrl}/product/mosaic-hops`,
        },
        {
          heading: 'Citra Hops',
          label: 'ready-out-of-stock',
          url: `${runtime.baseUrl}/product/citra-hops`,
        },
        {
          heading: 'Product not found',
          label: 'not-found',
          url: `${runtime.baseUrl}/product/missing-product`,
        },
        {
          heading: 'Product details unavailable',
          label: 'api-error',
          url: `${runtime.baseUrl}/product/detail-error`,
        },
      ] as const) {
        await page.goto(state.url);
        await expect(
          page.getByRole('heading', { name: state.heading }),
        ).toBeVisible();
        await assertResponsiveProductDetail(page, `${state.label}:${probe.id}`);
        await assertReducedMotionState(page, `${state.label}:${probe.id}`);
      }
    }

    await page.setViewportSize({ width: 360, height: 800 });
    for (const state of [
      {
        heading: 'Mosaic Hops',
        label: 'ready-in-stock',
        url: `${runtime.baseUrl}/product/mosaic-hops`,
      },
      {
        heading: 'Citra Hops',
        label: 'ready-out-of-stock',
        url: `${runtime.baseUrl}/product/citra-hops`,
      },
      {
        heading: 'Product not found',
        label: 'not-found',
        url: `${runtime.baseUrl}/product/missing-product`,
      },
      {
        heading: 'Product details unavailable',
        label: 'api-error',
        url: `${runtime.baseUrl}/product/detail-error`,
      },
    ] as const) {
      await page.goto(state.url);
      await expect(
        page.getByRole('heading', { name: state.heading }),
      ).toBeVisible();
      await assertNoBlockingAxeViolations(page, state.label);
    }
  });

  test('supports keyboard-only product-detail controls with visible focus', async ({
    page,
  }) => {
    const scenarios = [
      {
        label: 'ready-in-stock breadcrumb',
        target: () =>
          page
            .getByRole('navigation', { name: 'Breadcrumb' })
            .getByRole('link', { name: 'Products' }),
        url: `${runtime.baseUrl}/product/mosaic-hops`,
      },
      {
        label: 'ready-in-stock add to cart',
        target: () => page.getByRole('button', { name: 'Add to Cart' }),
        url: `${runtime.baseUrl}/product/mosaic-hops`,
      },
      {
        label: 'ready-out-of-stock breadcrumb',
        target: () =>
          page
            .getByRole('navigation', { name: 'Breadcrumb' })
            .getByRole('link', { name: 'Products' }),
        url: `${runtime.baseUrl}/product/citra-hops`,
      },
      {
        label: 'not-found return link',
        target: () => page.getByRole('link', { name: 'Back to products' }),
        url: `${runtime.baseUrl}/product/missing-product`,
      },
      {
        label: 'api-error retry',
        target: () => page.getByRole('button', { name: 'Try again' }),
        url: `${runtime.baseUrl}/product/detail-error`,
      },
    ];

    for (const scenario of scenarios) {
      await page.goto(scenario.url);
      const target = scenario.target();
      await expect(target).toBeVisible();
      await focusWithKeyboard(page, target, scenario.label);
      await assertProjectFocusVisible(target, scenario.label);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
    }
  });
});

test('streams loading and renders a safe product error when the API is unavailable', async ({
  page,
}) => {
  test.skip(!unavailable, 'requires the delayed unavailable API phase');
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const probe of viewportProbes) {
    await page.setViewportSize({ width: probe.width, height: probe.height });
    await page.goto(`/product/citra-hops?state=${probe.id}`, {
      waitUntil: 'commit',
    });
    await expect(
      page.getByRole('heading', { name: 'Loading product details' }),
    ).toBeVisible();
    const loadingStatus = page
      .getByRole('status')
      .filter({ hasText: 'Loading product details' });
    await expect(loadingStatus).toHaveAttribute('aria-live', 'polite');
    await expect(loadingStatus).toHaveAttribute('aria-busy', 'true');
    await assertResponsiveProductDetail(page, `loading:${probe.id}`);
    await assertReducedMotionState(page, `loading:${probe.id}`);
    if (probe.width === 360) {
      await assertNoBlockingAxeViolations(page, 'loading product detail', [
        'document-title',
      ]);
    }

    await expect(
      page.getByRole('heading', { name: 'Product details unavailable' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Product unavailable | Hop & Barley');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await assertResponsiveProductDetail(page, `api-error:${probe.id}`);
    await assertReducedMotionState(page, `api-error:${probe.id}`);
  }

  await assertNoBlockingAxeViolations(page, 'product API error');
});

async function localProductImagePath(image: Locator) {
  return image.evaluate((element) => {
    const productImage = element as HTMLImageElement;
    const url = new URL(productImage.currentSrc || productImage.src);
    return url.searchParams.get('url') ?? url.pathname;
  });
}

async function assertResponsiveProductDetail(page: Page, label: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(
    qualityGates.overflow.maximumUnexpectedHorizontalOverflowCssPx,
  );

  const targets = page.locator('main a:visible, main button:visible');
  for (const target of await targets.all()) {
    const box = await target.boundingBox();
    expect(box, `${label} target box`).not.toBeNull();
    expect(box!.height, `${label} target height`).toBeGreaterThanOrEqual(
      qualityGates.pointerTarget.minimumHeightCssPx,
    );
    expect(box!.width, `${label} target width`).toBeGreaterThanOrEqual(
      qualityGates.pointerTarget.minimumWidthCssPx,
    );
  }
}

async function assertReducedMotionState(page: Page, label: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    )
    .toBe(true);

  const state = page.locator('main > *').first();
  await expect(state, `${label} state`).toBeVisible();
  const motion = await state.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(motion, `${label} reduced motion`).toEqual({
    animationDuration: '1e-05s',
    scrollBehavior: qualityGates.reducedMotion.scrollBehavior,
    transitionDuration: '0s',
  });
}

async function focusWithKeyboard(page: Page, target: Locator, label: string) {
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement))
      return;
  }
  expect(
    await target.evaluate((element) => element === document.activeElement),
    `${label} is keyboard reachable`,
  ).toBe(true);
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

async function waitForProductDetailImage(page: Page) {
  const image = page.getByRole('main').getByRole('img');
  if ((await image.count()) === 0) return;
  await image.evaluate((element) => {
    const productImage = element as HTMLImageElement;
    const optimizedUrl = new URL(productImage.src, window.location.href);
    const localAssetUrl = optimizedUrl.searchParams.get('url');
    if (!localAssetUrl?.startsWith('/assets/products/')) {
      throw new TypeError('Product image must resolve to a local asset.');
    }
    productImage.removeAttribute('srcset');
    productImage.src = localAssetUrl;
  });
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const productImage = element as HTMLImageElement;
        return productImage.complete && productImage.naturalWidth > 0;
      }),
    )
    .toBe(true);
}

async function assertNoBlockingAxeViolations(
  page: Page,
  label: string,
  disabledRules: string[] = [],
) {
  const builder = new AxeBuilder({ page }).withTags(wcagTags);
  if (disabledRules.length > 0) builder.disableRules(disabledRules);
  const results = await builder.analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
    `${label} serious or critical Axe violations`,
  ).toEqual([]);
}

async function clearGuestCart(page: Page) {
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

async function interceptEmptyCart(page: Page) {
  const handler = async (route: import('@playwright/test').Route) => {
    const request = route.request();
    const origin = request.headers().origin;
    const corsHeaders = origin
      ? {
          'access-control-allow-credentials': 'true',
          'access-control-allow-origin': origin,
          vary: 'Origin',
        }
      : {};

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        headers: {
          ...corsHeaders,
          'access-control-allow-headers': 'content-type, x-csrf-token',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        },
        status: 204,
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname.endsWith('/cart')
    ) {
      await route.fulfill({
        body: JSON.stringify({
          adjustmentMessage: null,
          checkoutEligible: false,
          currency: 'USD',
          distinctItemCount: 0,
          items: [],
          serverNow: new Date().toISOString(),
          subtotalMinor: 0,
          totalQuantity: 0,
        }),
        contentType: 'application/json',
        headers: {
          ...corsHeaders,
          'cache-control': 'private, no-store',
        },
      });
      return;
    }

    await route.fallback();
  };

  await page.route('**/api/v1/cart', handler);
  await page.route('**/api/v1/cart/**', handler);
}
