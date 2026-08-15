import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  qualityGates,
  viewportProbes,
} from '../../web/src/quality/acceptance-matrix';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const coreViewports = viewportProbes.filter(
  ({ visualBaseline }) => visualBaseline,
);
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

test('has no serious or critical catalog accessibility violations', async ({
  page,
}) => {
  const urls = unavailable
    ? ['/?search=offline-accessibility']
    : [stateUrls.ready, stateUrls.filtered, stateUrls.empty];

  for (const url of urls) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(url);
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(
      results.violations.filter(
        ({ impact }) => impact === 'critical' || impact === 'serious',
      ),
    ).toEqual([]);
  }
});

test('matches connected catalog state baselines', async ({ page }) => {
  test.skip(unavailable, 'requires the connected API');
  test.slow();

  for (const [state, url] of Object.entries(stateUrls)) {
    for (const probe of coreViewports) {
      await page.setViewportSize({ width: probe.width, height: probe.height });
      await page.goto(url);
      await waitForProductImages(page);
      await captureCatalogViewport(page, `catalog-${state}-${probe.width}.png`);
    }
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(stateUrls.ready);
  await stabilizeCatalogScreenshot(page);
  await page.getByLabel('Search products').focus();
  await expect(
    page.getByRole('search', { name: 'Filter products' }),
  ).toHaveScreenshot('catalog-ready-filter-focus-360.png');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(stateUrls.filtered);
  await stabilizeCatalogScreenshot(page);
  await page.getByRole('link', { name: 'Next' }).focus();
  await expect(
    page.getByRole('navigation', { name: 'Catalog pages' }),
  ).toHaveScreenshot('catalog-filtered-pagination-focus-1280.png');

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(stateUrls.empty);
  await stabilizeCatalogScreenshot(page);
  await page.getByRole('link', { name: 'Clear filters' }).focus();
  await expect(
    page.getByRole('status').filter({ hasText: 'No products match' }),
  ).toHaveScreenshot('catalog-empty-recovery-focus-360.png');
});

test('matches unavailable and loading catalog state baselines', async ({
  page,
}) => {
  test.skip(!unavailable, 'requires the unavailable API phase');
  test.slow();

  for (const probe of coreViewports) {
    await page.setViewportSize({ width: probe.width, height: probe.height });
    await page.goto(`/?search=offline-error-${probe.width}`);
    await captureCatalogViewport(page, `catalog-error-${probe.width}.png`);

    await page.goto('/?page=201');
    await startLoadingNavigation(
      page,
      `/?search=loading-visual-${probe.width}`,
    );
    await captureCatalogViewport(page, `catalog-loading-${probe.width}.png`);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/?search=offline-retry-focus');
  await stabilizeCatalogScreenshot(page);
  await page.getByRole('link', { name: 'Try again' }).focus();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
  ).toHaveScreenshot('catalog-error-retry-focus-360.png');
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
  }
}

async function assertGridColumns(articles: Locator, width: number) {
  const boxes = await Promise.all(
    [0, 1, 2].map((index) => articles.nth(index).boundingBox()),
  );
  expect(boxes.every(Boolean)).toBe(true);
  const columns = new Set(boxes.map((box) => Math.round(box!.x)));
  expect(columns.size).toBe(width < 768 ? 1 : width < 1024 ? 2 : 3);
}

async function waitForProductImages(page: Page) {
  for (const image of await page.getByRole('article').getByRole('img').all()) {
    await expect(image).toHaveAttribute('loading', 'lazy');
    await image.evaluate((element) => {
      const productImage = element as HTMLImageElement;
      const optimizedUrl = new URL(productImage.src, window.location.href);
      const localAssetUrl = optimizedUrl.searchParams.get('url');
      if (!localAssetUrl?.startsWith('/assets/products/')) {
        throw new TypeError('Product image must resolve to a local asset.');
      }
      productImage.loading = 'eager';
      productImage.removeAttribute('srcset');
      productImage.src = localAssetUrl;
    });
    await image.evaluate((element) =>
      element.scrollIntoView({ block: 'center' }),
    );
    const accessibleName = await image.getAttribute('alt');
    await expect
      .poll(
        () =>
          image.evaluate((element) => {
            const productImage = element as HTMLImageElement;
            return productImage.complete && productImage.naturalWidth > 0;
          }),
        {
          message: `product image ${accessibleName ?? 'without alt'} loads`,
          timeout: 15_000,
        },
      )
      .toBe(true);
  }
}

async function captureCatalogViewport(page: Page, name: string) {
  await stabilizeCatalogScreenshot(page);
  const catalog = page
    .locator(
      'section[aria-label="Catalog"], section[aria-labelledby="catalog-title"]',
    )
    .first();
  await expect(catalog).toHaveScreenshot(name);
}

async function stabilizeCatalogScreenshot(page: Page) {
  await page.addStyleTag({
    content: '.skip-link:not(:focus) { visibility: hidden !important; }',
  });
}
