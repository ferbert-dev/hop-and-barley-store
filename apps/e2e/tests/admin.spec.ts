import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const adminPassword = process.env.HB_LOCAL_ADMIN_PASSWORD;
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('connected administrator product management', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(unavailable, 'runs only against the connected Nest API');
  test.skip(
    !adminPassword,
    'requires the protected local administrator fixture',
  );

  test('redirects an anonymous administrator request to the safe sign-in path', async ({
    page,
  }) => {
    await page.goto('/admin/products');

    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fproducts$/);
  });

  test('denies a current customer without exposing administrator content', async ({
    page,
  }) => {
    const email = `m2-customer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'M2-Customer9!Secure';

    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(password);
    await page.getByRole('button', { name: 'Register' }).click();
    await page.getByRole('link', { name: 'Continue to sign in' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/$/);

    const response = await page.goto('/admin/products');

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'Admin - Product Stock' }),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Add Product/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('link', { name: /^Edit(?:\s|$)/i }),
    ).toHaveCount(0);
    await expect(page.getByText('ADMIN', { exact: true })).toHaveCount(0);
  });

  test('renders the verified administrator product listing contract', async ({
    page,
  }) => {
    await signInAsAdmin(page);

    const managementLink = page.getByRole('link', {
      name: 'Product Management',
    });
    await expect(managementLink).toHaveAttribute('href', '/admin/products');
    await managementLink.click();
    await expect(page).toHaveURL(/\/admin\/products$/);

    await expect(
      page.getByRole('heading', { name: 'Admin - Product Stock' }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Admin sections' }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Admin sections' })
        .getByText('Product Management', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Dashboard', { exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    const filterSurface = page.getByRole('search', {
      name: 'Filter products',
    });
    await expect(
      filterSurface,
      'the existing product-list filter controls must remain available',
    ).toBeVisible();
    await expect(page.getByLabel('Search products')).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(4);
    await expect(page.getByLabel('Sort by')).toBeVisible();

    const productSurface = page
      .getByRole('table')
      .or(page.getByRole('list', { name: /products?/i }));
    await expect(productSurface.first(), 'product table/list').toBeVisible();

    await expect(
      page.getByRole('link', { name: /Add Product/i }),
    ).toBeVisible();
    const firstEdit = page
      .getByRole('link', { name: /^Edit(?:\s|$)/i })
      .first();
    await expect(firstEdit).toBeVisible();
    await expect(firstEdit).toHaveAttribute(
      'href',
      /^\/admin\/add\?productId=[0-9a-f-]+$/i,
    );

    for (const heading of ['Price', 'Category', 'Stock', 'Lifecycle']) {
      await expect(
        page
          .getByRole('columnheader', { name: new RegExp(heading, 'i') })
          .or(page.getByText(new RegExp(`^${heading}$`, 'i')))
          .first(),
        `product listing exposes ${heading}`,
      ).toBeVisible();
    }

    await expect(page.getByText(/\$\s?\d[\d,.]*\.\d{2}/).first()).toBeVisible();
    await expect(
      page.getByText(/\b(?:Hops|Malt|Yeast|Adjuncts)\b/i).first(),
    ).toBeVisible();
    await expect(
      page
        .getByText(
          /\b(?:\d[\d,.]*\s?(?:mg|g|kg|packs?|kits?|units?)|in stock|out of stock)\b/i,
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText(/\b(?:ACTIVE|SCHEDULED|EXPIRED|DISABLED)\b/i).first(),
    ).toBeVisible();

    const windowText = page.getByText(
      /(?:active\s*(?:from|until)|window|no (?:start|end)|never|—)/i,
    );
    await expect(windowText.first()).toBeVisible();

    const visibleText = await page.locator('body').innerText();
    expect(visibleText).not.toMatch(
      /(?:password|credential|imagePath|node_modules|\/Users\/|src\/)/i,
    );

    const next = page
      .getByRole('link', { name: 'Next' })
      .or(page.getByRole('button', { name: 'Next' }));
    if ((await next.count()) > 0) {
      await expect(next).toBeVisible();
      const previous = page.getByText('Previous', { exact: true }).first();
      await expect(previous).toBeVisible();
      const previousSemantics = await previous.evaluate((element) => ({
        ariaDisabled:
          element.getAttribute('aria-disabled') ??
          element.closest('[aria-disabled]')?.getAttribute('aria-disabled') ??
          null,
        href:
          element.getAttribute('href') ??
          element.closest('a')?.getAttribute('href') ??
          null,
      }));
      expect(
        previousSemantics.href !== null ||
          previousSemantics.ariaDisabled === 'true',
        'Previous pagination control must be a link or explicitly disabled',
      ).toBe(true);
    }

    expect(
      await page.evaluate(() => ({
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
      })),
    ).toEqual({ localStorage: 0, sessionStorage: 0 });
  });

  test('keeps the connected product list keyboard reachable and responsive', async ({
    page,
  }) => {
    await signInAsAdmin(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/admin/products', { waitUntil: 'domcontentloaded' });

    const addProduct = page.getByRole('link', { name: /Add Product/i });
    const firstEdit = page
      .getByRole('link', { name: /^Edit(?:\s|$)/i })
      .first();
    await addProduct.focus();
    await expect(addProduct).toBeFocused();
    for (let tabCount = 0; tabCount < 20; tabCount += 1) {
      if (
        await firstEdit.evaluate(
          (element) => element === document.activeElement,
        )
      ) {
        break;
      }
      await page.keyboard.press('Tab');
    }
    await expect(firstEdit).toBeFocused();

    for (const viewport of [
      { height: 640, width: 320 },
      { height: 900, width: 1280 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(
        page.getByRole('heading', { name: 'Admin - Product Stock' }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(
        overflow,
        `${viewport.width}px document overflow`,
      ).toBeLessThanOrEqual(1);
    }

    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(
      results.violations.filter(
        ({ impact }) => impact === 'critical' || impact === 'serious',
      ),
    ).toEqual([]);
  });
});

test.describe('administrator product listing unavailable state', () => {
  test.skip(!unavailable, 'runs only against the delayed unavailable API');

  test('keeps the M1 neutral boundary without requiring an M2 screen', async ({
    page,
  }) => {
    await page.goto('/admin/products');

    await expect(
      page.getByRole('heading', { name: 'Admin - Product Stock' }),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Add Product/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('link', { name: /^Edit(?:\s|$)/i }),
    ).toHaveCount(0);
  });
});

async function signInAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@gmail.com');
  await page.getByLabel('Password', { exact: true }).fill(adminPassword!);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/$/);
}
