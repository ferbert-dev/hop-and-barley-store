import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const adminPassword = process.env.HB_LOCAL_ADMIN_PASSWORD;
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('connected administrator authorization', () => {
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
    const email = `m1-customer-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'M1-Customer9!Secure';

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
    await expect(page.getByText('ADMIN', { exact: true })).toHaveCount(0);
  });

  test('lets the provisioned administrator enter the protected shell', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@gmail.com');
    await page.getByLabel('Password', { exact: true }).fill(adminPassword!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/$/);

    const managementLink = page.getByRole('link', {
      name: 'Product Management',
    });
    await expect(managementLink).toHaveAttribute('href', '/admin/products');
    await managementLink.click();

    await expect(page).toHaveURL(/\/admin\/products$/);
    await expect(
      page.getByRole('heading', { name: 'Admin - Product Stock' }),
    ).toBeVisible();
    await expect(page.getByText('Dashboard')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByRole('button')).toHaveCount(1);
    expect(
      await page.evaluate(() => ({
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
      })),
    ).toEqual({ localStorage: 0, sessionStorage: 0 });
  });

  test('reflows the static shell and has no serious Axe findings', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@gmail.com');
    await page.getByLabel('Password', { exact: true }).fill(adminPassword!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/admin/products');
    await page.emulateMedia({ reducedMotion: 'reduce' });

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
      expect(overflow).toBeLessThanOrEqual(1);
    }

    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(
      results.violations.filter(
        ({ impact }) => impact === 'critical' || impact === 'serious',
      ),
    ).toEqual([]);
  });
});
