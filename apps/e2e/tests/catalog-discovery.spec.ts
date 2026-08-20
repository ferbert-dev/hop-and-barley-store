import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  qualityGates,
  viewportProbes,
} from '../../web/src/quality/acceptance-matrix';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const stateUrls = {
  empty: '/?category=brewing-salts',
  filtered: '/?category=hops&sort=price-desc&limit=1',
  ready: '/',
} as const;

test('renders the ready catalog and applies URL-owned filters', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.goto('/');

  await expect(page.getByText('API connected')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(
    page.getByRole('search', { name: 'Filter products' }),
  ).toBeVisible();
  await expect(page.getByLabel('Category')).toHaveValue('');

  await page.getByLabel('Search products').fill('Citra');
  await page.getByLabel('Category').selectOption('hops');
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page).toHaveURL(/\?search=Citra&category=hops$/);
  await expect(page).toHaveTitle('Citra — Hop & Barley products');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Citra Hops' })).toBeVisible();
  await expect(page.getByText('1 product found')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Clear filters' }),
  ).toHaveAttribute('href', '/');
});

test('supports keyboard-only catalog filtering with Tab, Shift+Tab, and Enter', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const search = page.getByLabel('Search products');
  const category = page.getByLabel('Category');
  await expect(
    page.getByRole('status').filter({ hasText: 'API connected' }),
  ).toBeVisible();
  await expect(
    page.getByRole('search', { name: 'Filter products' }),
  ).toBeVisible();
  await expect(search).toBeVisible();
  await expect(category).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to main content' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Hop and Barley home' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Storefront' })
      .getByRole('link', { name: 'Products', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Storefront' })
      .getByRole('link', { name: 'Shopping cart' }),
  ).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  await assertProjectFocusVisible(search, 'ready');
  await page.keyboard.type('Citra');

  await page.keyboard.press('Tab');
  await expect(category).toBeFocused();
  await page.keyboard.press('h');
  await expect(category).toHaveValue('hops');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Minimum price')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Maximum price')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Sort by')).toBeFocused();
  await page.keyboard.press('Tab');
  const limit = page.getByLabel('Products per page');
  await expect(limit).toBeFocused();
  await page.keyboard.press('Tab');
  const apply = page.getByRole('button', { name: 'Apply filters' });
  await expect(apply).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(limit).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(apply).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\?search=Citra&category=hops$/);
  await expect(page).toHaveTitle('Citra — Hop & Barley products');
  await expect(page.getByRole('link', { name: 'Citra Hops' })).toBeVisible();

  const filteredFocus = page.getByRole('link', {
    name: 'Skip to main content',
  });
  await page.keyboard.press('Tab');
  await expect(filteredFocus).toBeFocused();
  await assertProjectFocusVisible(filteredFocus, 'filtered');
});

test('keeps stable pagination and restores URL state with browser history', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.goto(stateUrls.filtered);

  await expect(page.getByRole('link', { name: 'Mosaic Hops' })).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('link', { name: 'Cascade Hops' })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Catalog pages' })
      .locator('[aria-current="page"]'),
  ).toHaveText('2');

  await page.goBack();
  await expect(page).toHaveURL(stateUrls.filtered);
  await expect(page.getByRole('link', { name: 'Mosaic Hops' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('link', { name: 'Cascade Hops' })).toBeVisible();
});

test('renders the native filter form and filtered products in server HTML', async ({
  request,
}) => {
  test.skip(unavailable, 'requires the connected API');
  const response = await request.get('/?search=Citra&category=hops');
  expect(response.ok()).toBe(true);

  const html = await response.text();
  expect(html).toContain('<form aria-label="Filter products"');
  expect(html).toContain('action="/" method="get"');
  expect(html).toContain('Citra Hops');
  expect(html).toContain('value="Citra"');
  expect(html).toContain('<option value="hops" selected="">Hops</option>');
});

test('renders invalid and empty URLs with safe recovery controls', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');

  await page.goto('/?search=hops&search=malts');
  await expect(page.getByText('API not contacted')).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid catalog URL' }),
  ).toContainText('Catalog parameters must appear only once.');

  await page.goto(stateUrls.empty);
  await expect(
    page.getByRole('heading', { name: 'No products match these filters' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clear filters' })).toBeVisible();
  await expect(page.getByLabel('Category')).toContainText('Hops');
});

test('supports keyboard-only empty recovery with visible focus', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(stateUrls.empty);

  const clear = page.getByRole('link', { name: 'Clear filters' });
  await expect(
    page.getByRole('status').filter({ hasText: 'API connected' }),
  ).toBeVisible();
  await expect(
    page.getByRole('search', { name: 'Filter products' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No products match these filters' }),
  ).toBeVisible();
  await expect(clear).toBeVisible();

  await pressTab(page, 12);
  await expect(clear).toBeFocused();
  await assertProjectFocusVisible(clear, 'empty recovery');

  await page.keyboard.press('Shift+Tab');
  await expect(
    page.getByRole('button', { name: 'Apply filters' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(clear).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('Shop brewing ingredients | Hop & Barley');
  await expect(page.getByText('12 products found')).toBeVisible();
});

test('announces and titles ready, filtered, and empty catalog routes', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');

  const states = [
    {
      announcement: '12 products found',
      title: 'Shop brewing ingredients | Hop & Barley',
      url: stateUrls.ready,
    },
    {
      announcement: /\d+ products found/,
      title: 'Hops — Hop & Barley products',
      url: stateUrls.filtered,
    },
    {
      announcement: 'No products match these filters',
      title: 'Brewing Salts — Hop & Barley products',
      url: stateUrls.empty,
    },
  ] as const;

  for (const state of states) {
    await page.goto(state.url);
    await expect(page).toHaveTitle(state.title);
    await expect(
      page.getByRole('status').filter({ hasText: 'API connected' }),
    ).toBeVisible();
    const announcement = page
      .locator('[aria-live="polite"]')
      .filter({ hasText: state.announcement });
    await expect(announcement).toBeVisible();
  }
});

test('keeps ready, filtered, and empty states responsive at every Q1 probe', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  test.slow();

  for (const [state, url] of Object.entries(stateUrls)) {
    for (const probe of viewportProbes) {
      await page.setViewportSize({ width: probe.width, height: probe.height });
      await page.goto(url);
      await assertResponsiveCatalog(page, `${state}:${probe.id}`);

      if (state === 'ready') {
        const articles = page.getByRole('article');
        await expect(articles).toHaveCount(12);
        await assertGridColumns(articles, probe.width);
      }
    }
  }
});

test('keeps unavailable and loading states responsive at every Q1 probe', async ({
  page,
}) => {
  test.skip(!unavailable, 'requires the unavailable API phase');
  test.slow();

  for (const probe of viewportProbes) {
    await page.setViewportSize({ width: probe.width, height: probe.height });
    await page.goto(`/?search=offline-${probe.width}`);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
    ).toBeVisible();
    await assertResponsiveCatalog(page, `error:${probe.id}`);

    await page.goto('/?page=201');
    await startLoadingNavigation(
      page,
      `/?search=loading-${probe.width}-${probe.id}`,
    );
    await assertResponsiveCatalog(page, `loading:${probe.id}`);
  }
});

test('announces and titles loading and error catalog routes', async ({
  page,
}) => {
  test.skip(!unavailable, 'requires the unavailable API phase');
  const search = 'Loading route announcement';
  const targetHref = `/?search=${encodeURIComponent(search)}`;

  await page.goto('/?page=201');
  await expect(page).toHaveTitle('Invalid catalog URL | Hop & Barley');
  await startLoadingNavigation(page, targetHref);
  const loading = page
    .getByRole('status')
    .filter({ hasText: 'Loading products' });
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading).toHaveAttribute('aria-live', 'polite');
  await expect(page).toHaveTitle(`${search} — Hop & Barley products`);

  const error = page
    .getByRole('alert')
    .filter({ hasText: 'Products unavailable' });
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute('aria-live', 'assertive');
  await expect(page).toHaveTitle(`${search} — Hop & Barley products`);
});

test('supports keyboard-only error retry with visible focus', async ({
  page,
}) => {
  test.skip(!unavailable, 'requires the unavailable API phase');
  const retryHref = '/?search=keyboard-error-retry';
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(retryHref);

  const retry = page.getByRole('link', { name: 'Try again' });
  await expect(
    page.getByRole('status').filter({ hasText: 'API unavailable' }),
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
  ).toBeVisible();
  await expect(retry).toBeVisible();

  await pressTab(page, 5);
  await expect(retry).toBeFocused();
  await assertProjectFocusVisible(retry, 'error retry');

  await page.keyboard.press('Shift+Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Storefront' })
      .getByRole('link', { name: 'Shopping cart' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(retry).toBeFocused();

  const navigation = page.waitForNavigation();
  await page.keyboard.press('Enter');
  await navigation;
  await expect(page).toHaveURL(retryHref);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
  ).toBeVisible();
});

test('has no serious or critical catalog accessibility violations', async ({
  page,
}) => {
  const urls = unavailable
    ? ['/?search=offline-accessibility']
    : [stateUrls.ready, stateUrls.filtered, stateUrls.empty];

  for (const url of urls) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(url);
    await assertNoBlockingAxeViolations(page, url);
  }
});

test('has no serious or critical Axe violations in the loading state', async ({
  page,
}) => {
  test.skip(!unavailable, 'requires the unavailable API phase');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?page=201');
  await startLoadingNavigation(page, '/?search=loading-axe-state');
  await assertNoBlockingAxeViolations(page, 'loading');
});

test('honours reduced motion in ready, filtered, empty, loading, and error states', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  if (unavailable) {
    const loadingSearch = 'reduced-motion-loading';
    await page.goto('/?page=201');
    await startLoadingNavigation(
      page,
      `/?search=${encodeURIComponent(loadingSearch)}`,
    );
    const loading = page
      .getByRole('status')
      .filter({ hasText: 'Loading products' });
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    await expect(loading).toHaveAttribute('aria-live', 'polite');
    await expect(page).toHaveTitle(`${loadingSearch} — Hop & Barley products`);
    await assertReducedMotionState(page, 'loading');

    const errorSearch = 'reduced-motion-error';
    await page.goto(`/?search=${encodeURIComponent(errorSearch)}`);
    await expect(
      page.getByRole('status').filter({ hasText: 'API unavailable' }),
    ).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
    await expect(page).toHaveTitle(`${errorSearch} — Hop & Barley products`);
    await assertReducedMotionState(page, 'error');
    return;
  }

  await page.goto(stateUrls.ready);
  await expect(
    page.getByRole('status').filter({ hasText: 'API connected' }),
  ).toBeVisible();
  await expect(page.getByText('12 products found')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply filters' }),
  ).toBeVisible();
  await expect(page).toHaveTitle('Shop brewing ingredients | Hop & Barley');
  await assertReducedMotionState(page, 'ready');

  await page.goto(stateUrls.filtered);
  await expect(
    page.getByRole('status').filter({ hasText: 'API connected' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mosaic Hops' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Next' })).toBeVisible();
  await expect(page).toHaveTitle('Hops — Hop & Barley products');
  await assertReducedMotionState(page, 'filtered');

  await page.goto(stateUrls.empty);
  await expect(
    page.getByRole('status').filter({ hasText: 'API connected' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No products match these filters' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clear filters' })).toBeVisible();
  await expect(page).toHaveTitle('Brewing Salts — Hop & Barley products');
  await assertReducedMotionState(page, 'empty');
});

async function startLoadingNavigation(page: Page, targetHref: string) {
  const clear = page.getByRole('link', { name: 'Clear catalog URL' });
  await expect(clear).toBeVisible();
  await clear.evaluate((element, href) => {
    const link = element as HTMLAnchorElement;
    link.href = href;
    link.click();
  }, targetHref);
  await expect(
    page.getByRole('heading', { name: 'Loading products' }),
  ).toBeVisible({ timeout: 750 });
}

async function assertResponsiveCatalog(page: Page, label: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(
    qualityGates.overflow.maximumUnexpectedHorizontalOverflowCssPx,
  );

  const targets = page.locator(
    'main a:visible, main button:visible, main input:visible, main select:visible',
  );
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

async function assertNoBlockingAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(
    results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
    `${label} Axe results`,
  ).toEqual([]);
}

async function pressTab(page: Page, count: number) {
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
  }
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

async function assertReducedMotionState(page: Page, label: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    )
    .toBe(true);

  const catalog = page
    .locator(
      'section[aria-label="Catalog"], section[aria-labelledby="catalog-title"]',
    )
    .first();
  await expect(catalog, `${label} catalog`).toBeVisible();
  const motion = await catalog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      animationIterationCount: style.animationIterationCount,
      animationName: style.animationName,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      transitionDuration: style.transitionDuration,
    };
  });

  expect(motion, `${label} reduced motion`).toEqual({
    animationDuration: '1e-05s',
    animationIterationCount: '1',
    animationName: 'none',
    scrollBehavior: qualityGates.reducedMotion.scrollBehavior,
    transitionDuration: '0s',
  });
}

async function assertGridColumns(articles: Locator, width: number) {
  const boxes = await Promise.all(
    [0, 1, 2].map((index) => articles.nth(index).boundingBox()),
  );
  expect(boxes.every(Boolean)).toBe(true);
  const columns = new Set(boxes.map((box) => Math.round(box!.x)));
  expect(columns.size).toBe(width < 768 ? 1 : width < 1024 ? 2 : 3);
}
