import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('connected local authentication journey', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(unavailable, 'runs only against the connected Nest API');

  test('redirects an anonymous protected request without an open redirect', async ({
    page,
  }) => {
    const response = await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
    expect(response?.headers()['cache-control']).toContain('no-store');
  });

  test('registers, signs in, verifies the protected route, and signs out', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const email = `a1c-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'Abcdefghi1!x';

    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(password);
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(
      page.getByText('If the details can be accepted, your account is ready.'),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Continue to sign in' }).click();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();

    await page.getByRole('link', { name: 'Account' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your account' }),
    ).toBeVisible();
    await expect(page.getByText('You are signed in securely.')).toBeVisible();
    expect(
      await page.evaluate(() => ({
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
      })),
    ).toEqual({ localStorage: 0, sessionStorage: 0 });

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login\?status=signed-out$/);
    await expect(page.getByText('You have been signed out.')).toBeVisible();
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
  });

  test('reflows access screens and honours reduced motion without serious Axe findings', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const viewport of [
      { height: 640, width: 320 },
      { height: 900, width: 1280 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/register');
      await expect(
        page.getByRole('heading', { name: 'Create your account' }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      const results = await new AxeBuilder({ page })
        .withTags(wcagTags)
        .analyze();
      expect(
        results.violations.filter(
          ({ impact }) => impact === 'critical' || impact === 'serious',
        ),
      ).toEqual([]);
    }
  });
});

test.describe('authentication unavailable state', () => {
  test.skip(!unavailable, 'runs only against the delayed unavailable API');

  test('keeps errors generic and does not downgrade an unverified cookie to anonymous', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await page.context().addCookies([
      {
        domain: 'localhost',
        httpOnly: true,
        name: 'hb_session',
        path: '/',
        sameSite: 'Lax',
        value: 'unverified-session-value',
      },
    ]);
    await page.goto('/login');
    await expect(page.getByText('Account unavailable')).toBeVisible();
    await page.getByLabel('Email address').fill('brewer@example.com');
    await page.getByLabel('Password').fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const authError = page
      .getByRole('alert')
      .filter({ hasText: 'Authentication is temporarily unavailable.' });
    await expect(authError).toContainText(
      'Authentication is temporarily unavailable.',
    );
    await expect(authError).not.toContainText(/csrf|token|stack|fetch/i);
  });
});
