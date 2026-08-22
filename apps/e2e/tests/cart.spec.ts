import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

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
      page.getByRole('heading', { level: 1, name: 'Shopping cart' }),
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

    await page
      .getByRole('button', { name: 'Increase Citra Hops quantity' })
      .click();
    await expect(
      page.getByLabel('Quantity for Citra Hops').getByRole('status'),
    ).toHaveText('2');
    await expect(
      page.getByLabel('Cart summary').getByText('US$11.98'),
    ).toBeVisible();

    await seedCartLine(page, 'mosaic-hops');
    await page.reload();
    await page.getByRole('button', { name: 'Remove Citra Hops' }).click();
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

  test('validates the cart form and hands off to checkout without contact data in the URL', async ({
    page,
  }) => {
    await seedCartLine(page, 'citra-hops');
    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { name: 'Citra Hops' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await expect(page.getByText('Enter your full name.')).toBeVisible();
    await expect(page).toHaveURL('http://localhost:3000/cart');

    await page.getByLabel('Full name').fill('Ada Brewer');
    await page.getByLabel('Phone number').fill('+34 600 123 456');
    await page.getByLabel('City').fill('Madrid');
    await page.getByLabel('Shipping address').fill('Calle de la Malta 12');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();

    await expect(page).toHaveURL('http://localhost:3000/checkout');
    expect(new URL(page.url()).search).toBe('');
    await expect(page.locator('body')).not.toContainText('Ada Brewer');
    await expect(page.locator('body')).not.toContainText('Calle de la Malta');
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
    const increase = page.getByRole('button', {
      name: 'Increase Citra Hops quantity',
    });
    await focusWithKeyboard(page, increase);
    await assertProjectFocusVisible(increase, 'increase cart quantity');
    await page.keyboard.press('Enter');
    await expect(
      page.getByLabel('Quantity for Citra Hops').getByRole('status'),
    ).toHaveText('2');

    await assertNoBlockingAxeViolations(page, 'ready cart');
  });

  test('has no blocking axe findings in empty and seeded-ready cart states', async ({
    page,
  }) => {
    await clearCart(page);
    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shopping cart' }),
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
      page.getByRole('heading', { level: 1, name: 'Shopping cart' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await assertNoBlockingAxeViolations(page, 'unavailable cart');
  });
});

async function seedCartLine(page: Page, productSlug: string) {
  await page.goto('/cart');
  const response = await page.evaluate(async (slug) => {
    const apiUrl = 'http://localhost:3001/api/v1';
    const csrf = await fetch(`${apiUrl}/cart/csrf`, {
      credentials: 'include',
    });
    const csrfBody = csrf.ok
      ? ((await csrf.json()) as { csrfToken: string })
      : null;
    const add = await fetch(`${apiUrl}/cart/items`, {
      body: JSON.stringify({ productSlug: slug, quantity: 1 }),
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
      const apiUrl = 'http://localhost:3001/api/v1';
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
