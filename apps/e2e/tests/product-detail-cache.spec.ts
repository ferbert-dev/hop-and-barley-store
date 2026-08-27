import { expect, test, type Browser } from '@playwright/test';

import {
  startCatalogCacheRuntime,
  type CatalogCacheRuntime,
} from '../support/catalog-cache-runtime';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
let runtime: CatalogCacheRuntime;

test.describe('production product-detail data cache', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(unavailable, 'runs once in the connected production-cache phase');

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    runtime = await startCatalogCacheRuntime();
  });

  test.afterAll(async () => {
    await runtime?.stop();
  });

  test('renders product content in server HTML before hydration', async () => {
    const response = await fetch(`${runtime.baseUrl}/product/citra-hops`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Citra Hops');
    expect(html).toContain('Technical Specifications');
    expect(html).toContain('Add Citra Hops to Cart');
    expect(html).not.toContain('Latest reviews');
    expect(html).not.toContain('stockQuantity');
    expect(runtime.productUpstreamAttempts('citra-hops')).toBe(1);
  });

  test('deduplicates page and metadata reads and keys product slugs independently', async ({
    browser,
  }) => {
    await expectProduct(browser, 'citra-hops', 'Citra Hops');
    expect(runtime.productUpstreamAttempts('citra-hops')).toBe(1);
    await expect(waitForProductCacheEntry('citra-hops')).resolves.toEqual([
      expect.objectContaining({ revalidate: 60, status: 200 }),
    ]);

    await expectProduct(browser, 'citra-hops', 'Citra Hops');
    expect(runtime.productUpstreamAttempts('citra-hops')).toBe(1);

    await expectProduct(browser, 'mosaic-hops', 'Mosaic Hops');
    expect(runtime.productUpstreamAttempts('mosaic-hops')).toBe(1);
    expect(runtime.productUpstreamAttempts('citra-hops')).toBe(1);
    await expect(waitForProductCacheEntry('mosaic-hops')).resolves.toEqual([
      expect.objectContaining({ revalidate: 60, status: 200 }),
    ]);
  });

  test('does not cache a failed detail response and retries immediately', async ({
    browser,
  }) => {
    await expectProductError(browser, 'detail-error');
    expect(runtime.productUpstreamAttempts('detail-error')).toBe(1);
    await expect(
      runtime.fetchProductCacheEntries('detail-error'),
    ).resolves.toEqual([]);

    await expectProductError(browser, 'detail-error');
    expect(runtime.productUpstreamAttempts('detail-error')).toBe(2);
    await expect(
      runtime.fetchProductCacheEntries('detail-error'),
    ).resolves.toEqual([]);
  });
});

async function expectProduct(browser: Browser, slug: string, name: string) {
  const page = await browser.newPage();
  await page.goto(`${runtime.baseUrl}/product/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page).toHaveTitle(`${name} | Hop & Barley`);
  await page.close();
}

async function expectProductError(browser: Browser, slug: string) {
  const page = await browser.newPage();
  await page.goto(`${runtime.baseUrl}/product/${slug}`);
  await expect(
    page.getByRole('heading', { name: 'Product details unavailable' }),
  ).toBeVisible();
  await page.close();
}

async function waitForProductCacheEntry(slug: string) {
  await expect
    .poll(async () => (await runtime.fetchProductCacheEntries(slug)).length)
    .toBe(1);
  return runtime.fetchProductCacheEntries(slug);
}
