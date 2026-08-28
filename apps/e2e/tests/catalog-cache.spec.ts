import { expect, test, type Browser } from '@playwright/test';

import {
  startCatalogCacheRuntime,
  type CatalogCacheRuntime,
} from '../support/catalog-cache-runtime';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let runtime: CatalogCacheRuntime;

test.describe('production catalog data cache', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(unavailable, 'runs once in the connected production-cache phase');

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    runtime = await startCatalogCacheRuntime();
  });

  test.afterAll(async () => {
    await runtime?.stop();
  });

  test('persists the 60-second hint and keys canonical queries independently', async ({
    browser,
  }) => {
    expect(runtime.rootRouteIsPrerendered).toBe(false);

    const repeatedSearch = `Cache repeated ${runId}`;
    await expectConnectedResponse(browser, repeatedSearch, 1);
    expect(runtime.upstreamAttempts(repeatedSearch)).toBe(1);

    const entries = await waitForFetchCacheEntry(repeatedSearch);
    expect(entries).toEqual([
      expect.objectContaining({
        revalidate: 60,
        status: 200,
      }),
    ]);
    expectCanonicalCatalogEntry(entries[0]!.url, repeatedSearch);

    await expectConnectedResponse(browser, repeatedSearch, 1);
    expect(runtime.upstreamAttempts(repeatedSearch)).toBe(1);

    const distinctSearch = `Cache distinct ${runId}`;
    await expectConnectedResponse(browser, distinctSearch, 1);
    expect(runtime.upstreamAttempts(distinctSearch)).toBe(1);
    expect(runtime.upstreamAttempts(repeatedSearch)).toBe(1);
    await expect(waitForFetchCacheEntry(distinctSearch)).resolves.toEqual([
      expect.objectContaining({ revalidate: 60, status: 200 }),
    ]);
  });

  test('does not cache a failed upstream response and recovers immediately', async ({
    browser,
  }) => {
    const recoverySearch = `Cache recovery ${runId}`;
    runtime.failNext(recoverySearch);

    const failedPage = await openCatalog(browser, recoverySearch);
    await expect(failedPage.getByRole('status').first()).toHaveText(
      'API unavailable',
    );
    await expect(
      failedPage.getByRole('heading', { name: 'Products unavailable' }),
    ).toBeVisible();
    await failedPage.close();
    expect(runtime.upstreamAttempts(recoverySearch)).toBe(1);
    await expect(runtime.fetchCacheEntries(recoverySearch)).resolves.toEqual(
      [],
    );

    await expectConnectedResponse(browser, recoverySearch, 2);
    expect(runtime.upstreamAttempts(recoverySearch)).toBe(2);
    await expect(waitForFetchCacheEntry(recoverySearch)).resolves.toEqual([
      expect.objectContaining({ revalidate: 60, status: 200 }),
    ]);

    await expectConnectedResponse(browser, recoverySearch, 2);
    expect(runtime.upstreamAttempts(recoverySearch)).toBe(2);
  });
});

async function expectConnectedResponse(
  browser: Browser,
  search: string,
  attempt: number,
) {
  const page = await openCatalog(browser, search);
  await expect(page.getByRole('status').first()).toHaveText('API connected');
  await expect(
    page.getByRole('link', {
      name: `${search} response ${attempt}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.close();
}

async function openCatalog(browser: Browser, search: string) {
  const page = await browser.newPage();
  await page.goto(`${runtime.baseUrl}/?search=${encodeURIComponent(search)}`);
  return page;
}

async function waitForFetchCacheEntry(search: string) {
  await expect
    .poll(async () => (await runtime.fetchCacheEntries(search)).length)
    .toBe(1);
  return runtime.fetchCacheEntries(search);
}

function expectCanonicalCatalogEntry(rawUrl: string, search: string) {
  const url = new URL(rawUrl);
  expect(url.pathname).toBe('/api/v1/products');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    limit: '12',
    page: '1',
    search,
    sort: 'name-asc',
  });
}
