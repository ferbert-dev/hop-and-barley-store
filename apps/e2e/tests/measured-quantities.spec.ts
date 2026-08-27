import { expect, test, type Page } from '@playwright/test';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const connectedApiUrl = process.env.E2E_API_URL ?? null;

test.describe('measured product quantities', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(unavailable, 'requires the connected API');

  test.afterEach(async ({ page }) => {
    await clearGuestCart(page);
  });

  test('supports a kg-only 100g lattice, step buttons and server-owned previews', async ({
    page,
  }) => {
    await page.goto('/product/citra-hops');
    await expect(
      page.getByRole('heading', { name: 'Citra Hops' }),
    ).toBeVisible();

    const amount = amountInput(page);
    await expect(amount).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(amount).toHaveValue('0.1');
    await expect(
      page.getByText('US$5.99', { exact: true }).first(),
    ).toBeVisible();

    const increase = page.getByRole('button', {
      name: /Increase weight amount/i,
    });
    const decrease = page.getByRole('button', {
      name: /Decrease weight amount/i,
    });
    await increase.click();
    await expect(amount).toHaveValue('0.2');
    await expect(
      page.getByText('US$11.98', { exact: true }).first(),
    ).toBeVisible();
    await decrease.click();
    await expect(amount).toHaveValue('0.1');

    await amount.fill('0.9');
    await amount.press('Tab');
    await expect(amount).toHaveValue('0.9');
    await expect(page.getByText('900g selected')).toBeVisible();
    await expect(
      page.getByText('US$53.91', { exact: true }).first(),
    ).toBeVisible();

    await amount.fill('10');
    await amount.press('Tab');
    await expect(amount).toHaveValue('10');
    await expect(page.getByText(/10\s*kg/i).first()).toBeVisible();
    await expect(
      page.getByText('US$599.00', { exact: true }).first(),
    ).toBeVisible();

    await amount.fill('100');
    await amount.press('Tab');
    await expect(amount).toHaveValue('100');
    await expect(page.getByText(/100\s*kg/i).first()).toBeVisible();
    await expect(
      page.getByText('US$5,990.00', { exact: true }).first(),
    ).toBeVisible();

    await expect(addSelectedAmount(page)).resolves.toEqual({
      amount: 100_000_000,
      productSlug: 'citra-hops',
    });
    await expect(
      page.getByRole('link', { name: /Shopping cart, 1 item/ }),
    ).toBeVisible();
  });

  test('rejects below-minimum and off-step weight values without submitting', async ({
    page,
  }) => {
    await page.goto('/product/citra-hops');
    const amount = amountInput(page);
    const add = page.getByRole('button', { name: /^Add .+ to Cart$/ });
    await expect(add).toBeEnabled();

    const submitted: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().endsWith('/api/v1/cart/items')
      ) {
        submitted.push(request.url());
      }
    });

    for (const invalid of ['0.095', '0.15']) {
      await amount.fill(invalid);
      await amount.press('Tab');
      await add.click();
      await expect(amount).toHaveAttribute('aria-invalid', 'true');
      await expect(
        page.getByText(
          /minimum.*100|100.*minimum|increments?.*100|100.*increment/i,
        ),
      ).toBeVisible();
      await expect(add).toBeEnabled();
    }

    expect(submitted).toEqual([]);
  });

  test('persists an exact physical amount and server total through cart navigation and refresh', async ({
    page,
  }) => {
    await page.goto('/product/citra-hops');
    const amount = amountInput(page);
    await amount.fill('0.9');
    await amount.press('Tab');
    await expect(
      page.getByText('US$53.91', { exact: true }).first(),
    ).toBeVisible();

    await expect(addSelectedAmount(page)).resolves.toEqual({
      amount: 900_000,
      productSlug: 'citra-hops',
    });
    await expect(
      page.getByRole('link', { name: /Shopping cart, 1 item/ }),
    ).toBeVisible();
    await page.getByRole('link', { name: /Shopping cart, 1 item/ }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(
      page.getByRole('heading', { name: 'Citra Hops' }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Citra Hops quantity').getByLabel('Quantity'),
    ).toHaveValue('0.9');
    await expect(
      page.getByLabel('Cart summary').getByText('US$53.91'),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByLabel('Citra Hops quantity').getByLabel('Quantity'),
    ).toHaveValue('0.9');
    await expect(
      page.getByLabel('Cart summary').getByText('US$53.91'),
    ).toBeVisible();
  });

  test('keeps packages as integer packs, reports known SafAle net weight, and does not invent Imperial grams', async ({
    page,
  }) => {
    await page.goto('/product/safale-us05-yeast');
    await expect(
      page.getByRole('heading', { name: 'SafAle US-05 Dry Ale Yeast' }),
    ).toBeVisible();
    const packageAmount = amountInput(page);
    await expect(packageAmount).toHaveValue('1');
    await expect(page.getByText(/11\.5\s*g/i).first()).toBeVisible();
    await expect(page.getByText(/pack|sachet/i).first()).toBeVisible();
    await page
      .getByRole('button', {
        name: /Increase package amount/i,
      })
      .click();
    await expect(packageAmount).toHaveValue('2');
    await expect(addSelectedAmount(page)).resolves.toEqual({
      amount: 2,
      productSlug: 'safale-us05-yeast',
    });
    await page.getByRole('link', { name: /Shopping cart, 1 item/ }).click();
    await expect(
      page.getByText(/2\s*(?:packs?|sachets?)/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/23(?:\.0+)?\s*g/i).first()).toBeVisible();

    await page.goto('/product/imperial-yeast');
    await expect(
      page.getByRole('heading', { name: 'Imperial Organic Yeast A07' }),
    ).toBeVisible();
    const imperialText = await page.getByRole('main').innerText();
    expect(imperialText).toMatch(/pack|pouch/i);
    expect(imperialText).not.toMatch(/\b\d+(?:\.\d+)?\s*g\b/i);
  });

  test('shows four West Coast kits as 20 gal and approximately 76 L, while the badge counts lines', async ({
    page,
  }) => {
    await page.goto('/product/west-coast-ipa-kit');
    await expect(
      page.getByRole('heading', { name: 'West Coast IPA - All-Grain Kit' }),
    ).toBeVisible();
    const kits = amountInput(page);
    await expect(kits).toHaveValue('1');
    for (let index = 0; index < 3; index += 1) {
      await page
        .getByRole('button', {
          name: /Increase kit amount/i,
        })
        .click();
    }
    await expect(kits).toHaveValue('4');
    await expect(addSelectedAmount(page)).resolves.toEqual({
      amount: 4,
      productSlug: 'west-coast-ipa-kit',
    });
    await page.getByRole('link', { name: /Shopping cart, 1 item/ }).click();
    await expect(page.getByText(/20\s*gal/i).first()).toBeVisible();
    await expect(
      page.getByText(/(?:75(?:\.\d+)?|76)\s*l/i).first(),
    ).toBeVisible();

    await page.goto('/product/citra-hops');
    const weight = amountInput(page);
    await weight.fill('0.2');
    await weight.press('Tab');
    await expect(addSelectedAmount(page)).resolves.toEqual({
      amount: 200_000,
      productSlug: 'citra-hops',
    });
    await expect(
      page.getByRole('link', { name: /Shopping cart, 2 items/ }),
    ).toBeVisible();
  });

  test('supports keyboard amount changes and reflows without horizontal overflow', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/product/citra-hops');

    const amount = amountInput(page);
    await amount.fill('0.9');
    await page.keyboard.press('Tab');
    await expect(amount).toHaveValue('0.9');
    await expect(
      page.getByText('US$53.91', { exact: true }).first(),
    ).toBeVisible();

    const increase = page.getByRole('button', {
      name: /Increase weight amount/i,
    });
    await increase.focus();
    await page.keyboard.press('Enter');
    await expect(amount).toHaveValue('1');
    await expect(page.getByText('1kg selected')).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(increase).toBeFocused();
  });
});

function amountInput(page: Page) {
  return page.getByLabel(/Quantity|Packs|Kits/i).first();
}

async function addSelectedAmount(page: Page) {
  const [request, response] = await Promise.all([
    page.waitForRequest(
      (candidate) =>
        candidate.url().endsWith('/api/v1/cart/items') &&
        candidate.method() === 'POST',
    ),
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith('/api/v1/cart/items') &&
        candidate.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /^Add .+ to Cart$/ }).click(),
  ]);
  expect(response.ok(), `cart add returned ${String(response.status())}`).toBe(
    true,
  );
  return request.postDataJSON() as Record<string, unknown>;
}

async function clearGuestCart(page: Page) {
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
