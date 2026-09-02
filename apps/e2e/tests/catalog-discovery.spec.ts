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
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expectApiStatus(page, 'API connected');
  await expect(
    page.getByRole('img', { name: 'Close-up hop cones and green leaves' }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(
    page.getByRole('search', { name: 'Search products' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);

  await page
    .getByRole('searchbox', { name: /Search products/ })
    .first()
    .fill('Citra');
  await expect(page).toHaveURL(/\?search=Citra$/);
  await page.getByRole('button', { name: 'Filters' }).click();
  const drawer = page.getByRole('dialog', { name: 'Filters' });
  await drawer.getByRole('checkbox', { name: /Hops/ }).check();
  await drawer.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page).toHaveURL(/\?search=Citra&category=hops$/);
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Citra Hops', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('1 product found').first()).toBeVisible();
});

test('keeps realtime search synchronized with client navigation and title', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const search = page
    .getByRole('searchbox', { name: /Search products/ })
    .first();
  await search.fill('Citra');
  await expect(page).toHaveURL(/\?search=Citra$/);
  await expect(page).toHaveTitle('Citra — Hop & Barley products');

  await page
    .getByRole('navigation', { name: 'Storefront' })
    .getByRole('link', { name: 'Products', exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(search).toHaveValue('');
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('Shop brewing ingredients | Hop & Barley');
});

test('renders dynamic filter choices and preserves only approved discovery controls', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.goto(
    '/?search=citrus+hops&category=hops&category=malts&page=2&limit=1',
    { waitUntil: 'domcontentloaded' },
  );

  await expect(
    page.getByRole('searchbox', { name: /Search products/ }).first(),
  ).toHaveValue('citrus hops');
  await expect(page.getByRole('list', { name: 'Search keywords' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0);

  await page.getByRole('button', { name: /Filters/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Filters' });
  const productType = page.getByRole('group', { name: 'Product Type' });
  await expect(
    productType.getByRole('checkbox', { name: /Hops/ }),
  ).toBeChecked();
  await expect(
    productType.getByRole('checkbox', { name: /Malt/ }),
  ).toBeChecked();
  await expect(
    productType.getByRole('checkbox', { name: /Kits/ }),
  ).toBeVisible();
  await expect(page.getByText('Selected filters')).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Close filters' }).click();
  await page.getByRole('button', { name: 'Sort by: Name A–Z' }).click();
  const sort = page.getByRole('navigation', { name: 'Sort products' });
  await expect(sort.getByRole('link')).toHaveText([
    'Name A–Z',
    'Name Z–A',
    'Price low to high',
    'Price high to low',
  ]);
  await expect(sort.getByRole('link', { name: 'New' })).toHaveCount(0);
  await expect(sort.getByRole('link', { name: 'Rating' })).toHaveCount(0);
  await expect(page.getByLabel('Minimum price')).toHaveCount(0);
  await expect(page.getByLabel('Maximum price')).toHaveCount(0);
  await expect(page.getByLabel('Products per page')).toHaveCount(0);
});

test('supports keyboard-only catalog filtering with Tab, Shift+Tab, and Enter', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const search = page
    .getByRole('searchbox', { name: /Search products/ })
    .first();
  const filterButton = page.getByRole('button', { name: 'Filters' });
  await expectApiStatus(page, 'API connected');
  await expect(
    page.getByRole('search', { name: 'Search products' }),
  ).toBeVisible();
  await expect(search).toBeVisible();
  await expect(filterButton).toBeVisible();

  await tabUntilFocused(page, search);
  await expect(search).toBeFocused();
  await assertProjectFocusVisible(
    page.getByRole('search', { name: 'Search products' }),
    'ready',
  );
  await page.keyboard.type('Citra');
  await expect(page).toHaveURL(/\?search=Citra$/);

  await page.keyboard.press('Tab');
  await expect(filterButton).toBeFocused();
  await page.keyboard.press('Enter');

  const close = page.getByRole('button', { name: 'Close filters' });
  const hops = page.getByRole('checkbox', { name: /Hops/ });
  const malt = page.getByRole('checkbox', { name: /Malt/ });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(hops).toBeFocused();
  await page.keyboard.press('Space');
  await expect(hops).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(malt).toBeFocused();
  await page.keyboard.press('Space');
  await expect(malt).toBeChecked();

  await page.keyboard.press('Shift+Tab');
  await expect(hops).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  const apply = page.getByRole('button', { name: 'Apply filters' });
  await tabUntilFocused(page, apply, 16);
  await expect(apply).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\?search=Citra&category=hops&category=malts$/);
  await expect(page.getByRole('dialog', { name: 'Filters' })).not.toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Citra Hops', exact: true }),
  ).toBeVisible();

  await expect(filterButton).toBeFocused();
  await page.keyboard.press('Tab');
  const sort = page.getByRole('button', { name: 'Sort by: Name A–Z' });
  await expect(sort).toBeFocused();
  await assertProjectFocusVisible(sort, 'ready');
  await page.keyboard.press('Enter');
  const sortMenu = page.getByRole('navigation', { name: 'Sort products' });
  await expect(sortMenu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(sortMenu.getByRole('link', { name: 'Name A–Z' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(
    sortMenu.getByRole('link', { name: 'Price high to low' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(
    /\?search=Citra&category=hops&category=malts&sort=price-desc$/,
  );
  await expect(sortMenu).not.toBeVisible();
  const selectedSort = page.getByRole('button', {
    name: 'Sort by: Price high to low',
  });
  await expect(selectedSort).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sortMenu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sortMenu).not.toBeVisible();
  await expect(selectedSort).toBeFocused();
});

test('keeps stable pagination and restores URL state with browser history', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.goto(stateUrls.filtered, { waitUntil: 'domcontentloaded' });

  await expect(
    page.getByRole('link', { name: 'Mosaic Hops', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page.getByRole('link', { name: 'Cascade Hops', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Catalog pages' })
      .locator('[aria-current="page"]'),
  ).toHaveText('2');

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(stateUrls.filtered);
  await expect(
    page.getByRole('link', { name: 'Mosaic Hops', exact: true }),
  ).toBeVisible();
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('link', { name: 'Cascade Hops', exact: true }),
  ).toBeVisible();
});

test('renders discovery controls and filtered products in server HTML', async ({
  request,
}) => {
  test.skip(unavailable, 'requires the connected API');
  const response = await request.get('/?search=Citra&category=hops');
  expect(response.ok()).toBe(true);

  const html = await response.text();
  expect(html).toContain('<form aria-label="Search products"');
  expect(html).toContain('role="search"');
  expect(html).toContain('Citra Hops');
  expect(html).toContain('value="Citra"');
  expect(html).toContain('<dialog aria-labelledby="catalog-filter-title"');
  expect(html).toContain('<legend>Product Type</legend>');
  expect(html).toContain('value="hops"');
  expect(html).toContain('checked');
});

test('renders invalid and empty URLs with safe recovery controls', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');

  await page.goto('/?search=hops&search=malts', {
    waitUntil: 'domcontentloaded',
  });
  await expectApiStatus(page, 'API not contacted');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid catalog URL' }),
  ).toContainText('Only Product Type may appear more than once.');

  await page.goto(stateUrls.empty, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'No products match these filters' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clear filters' })).toBeVisible();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('checkbox', { name: /Hops/ })).toBeVisible();
});

test('supports keyboard-only empty recovery with visible focus', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(stateUrls.empty, { waitUntil: 'domcontentloaded' });

  const clear = page.getByRole('link', { name: 'Clear filters' });
  await expectApiStatus(page, 'API connected');
  await expect(
    page.getByRole('search', { name: 'Search products' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No products match these filters' }),
  ).toBeVisible();
  await expect(clear).toBeVisible();

  await tabUntilFocused(page, clear);
  await expect(clear).toBeFocused();
  await assertProjectFocusVisible(clear, 'empty recovery');

  await page.keyboard.press('Shift+Tab');
  await expect(page.getByLabel('Sort by')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(clear).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('Shop brewing ingredients | Hop & Barley');
  await expect(page.getByText(/\d+ products found/).first()).toBeVisible();
});

test('announces and titles ready, filtered, and empty catalog routes', async ({
  page,
}) => {
  test.skip(unavailable, 'requires the connected API');

  const states = [
    {
      announcement: /\d+ products found/,
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
    await page.goto(state.url, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(state.title);
    await expectApiStatus(page, 'API connected');
    const announcement = page
      .locator('[aria-live="polite"]')
      .filter({ hasText: state.announcement })
      .first();
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
      await page.goto(url, { waitUntil: 'domcontentloaded' });
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
    await page.goto(`/?search=offline-${probe.width}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
    ).toBeVisible();
    await assertResponsiveCatalog(page, `error:${probe.id}`);

    await page.goto('/?page=201', { waitUntil: 'domcontentloaded' });
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

  await page.goto('/?page=201', { waitUntil: 'domcontentloaded' });
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
  await page.goto(retryHref, { waitUntil: 'domcontentloaded' });

  const retry = page.getByRole('link', { name: 'Try again' });
  await expectApiStatus(page, 'API unavailable');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
  ).toBeVisible();
  await expect(retry).toBeVisible();

  await pressTab(page, 7);
  await expect(retry).toBeFocused();
  await assertProjectFocusVisible(retry, 'error retry');

  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Register' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Storefront' })
      .getByRole('link', { name: 'Shopping cart' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(retry).toBeFocused();

  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
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
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await assertNoBlockingAxeViolations(page, url);
  }
});

test('has no serious or critical Axe violations in the loading state', async ({
  page,
}) => {
  test.skip(!unavailable, 'requires the unavailable API phase');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?page=201', { waitUntil: 'domcontentloaded' });
  await startLoadingNavigation(page, '/?search=loading-axe-state');
  await assertNoBlockingAxeViolations(page, 'loading');
});

test('honours reduced motion in ready, filtered, empty, loading, and error states', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  if (unavailable) {
    const loadingSearch = 'reduced-motion-loading';
    await page.goto('/?page=201', { waitUntil: 'domcontentloaded' });
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
    await page.goto(`/?search=${encodeURIComponent(errorSearch)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expectApiStatus(page, 'API unavailable');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
    await expect(page).toHaveTitle(`${errorSearch} — Hop & Barley products`);
    await assertReducedMotionState(page, 'error');
    return;
  }

  await page.goto(stateUrls.ready, { waitUntil: 'domcontentloaded' });
  await expectApiStatus(page, 'API connected');
  await expect(page.getByText(/\d+ products found/).first()).toBeVisible();
  await expect(
    page.getByRole('searchbox', { name: /Search products/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters' })).toBeVisible();
  await expect(page).toHaveTitle('Shop brewing ingredients | Hop & Barley');
  await assertReducedMotionState(page, 'ready');

  await page.goto(stateUrls.filtered, { waitUntil: 'domcontentloaded' });
  await expectApiStatus(page, 'API connected');
  await expect(
    page.getByRole('link', { name: 'Mosaic Hops', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Next' })).toBeVisible();
  await expect(page).toHaveTitle('Hops — Hop & Barley products');
  await assertReducedMotionState(page, 'filtered');

  await page.goto(stateUrls.empty, { waitUntil: 'domcontentloaded' });
  await expectApiStatus(page, 'API connected');
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

async function expectApiStatus(page: Page, status: string) {
  await expect(
    page.getByRole('status').filter({ hasText: status }).first(),
  ).toHaveText(status);
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
    'main a:visible, main button:visible, main input:visible:not([type="radio"]), main label:has(input[type="radio"]):visible, main select:visible',
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

async function tabUntilFocused(page: Page, target: Locator, limit = 24) {
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press('Tab');
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
  }
  throw new Error(`Target did not receive keyboard focus within ${limit} tabs`);
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
    [0, 1, 2, 3].map((index) => articles.nth(index).boundingBox()),
  );
  expect(boxes.every(Boolean)).toBe(true);
  const columns = new Set(boxes.map((box) => Math.round(box!.x)));
  expect(columns.size).toBe(
    width < 768 ? 1 : width < 1024 ? 2 : width < 1280 ? 3 : 4,
  );
}
