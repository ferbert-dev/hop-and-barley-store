import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const unavailable = process.env.E2E_EXPECT_API_STATUS === 'API unavailable';
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_EXPIRY_TOLERANCE_SECONDS = 120;
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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
    await expect(
      page.getByRole('checkbox', { name: 'Remember me' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveCount(0);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password').fill(password);
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(
      page.getByText('If the details can be accepted, your account is ready.'),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Continue to sign in' }).click();
    const rememberMe = page.getByRole('checkbox', { name: 'Remember me' });
    await expect(rememberMe).not.toBeChecked();
    await expect(
      page.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveAttribute('href', '/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
    const sessionCookie = await readSessionCookieMetadata(page);
    expect(sessionCookie).toMatchObject({
      expires: -1,
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
    });

    await page.getByRole('link', { name: 'Account' }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Account Information',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Phone number')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await expect(page.getByLabel('City')).toBeVisible();
    await expect(page.getByText('Account role').locator('..')).toContainText(
      'Customer',
    );

    const profileSave = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/users/me') &&
        response.request().method() === 'PATCH',
    );
    await page.getByLabel('Full Name').fill('Local Brewer');
    await page.getByLabel('Phone number').fill('+34 600 123 456');
    await page.getByLabel('City').fill('Madrid');
    await page.getByRole('button', { name: 'Save' }).click();
    await profileSave;
    await expect(page.getByRole('status')).toHaveText(
      'Your account information was saved.',
    );
    await page.reload();
    await expect(page.getByLabel('Full Name')).toHaveValue('Local Brewer');
    await expect(page.getByLabel('Phone number')).toHaveValue(
      '+34 600 123 456',
    );
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await expect(page.getByLabel('City')).toHaveValue('Madrid');

    const avatarUpload = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/users/me/avatar') &&
        response.request().method() === 'PUT',
    );
    const avatarRead = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/users/me/avatar') &&
        response.request().method() === 'GET',
    );
    await page.getByLabel('Choose image').setInputFiles({
      buffer: ONE_PIXEL_PNG,
      mimeType: 'image/png',
      name: 'profile.png',
    });
    await page.getByRole('button', { name: 'Upload photo' }).click();
    await avatarUpload;
    await expect(page.getByRole('status')).toHaveText(
      'Your profile photo was updated.',
    );
    const currentPhoto = page.getByAltText('Current profile photo');
    await expect(currentPhoto).toBeVisible();
    await expect
      .poll(() =>
        currentPhoto.evaluate((image: HTMLImageElement) =>
          image.complete ? image.naturalWidth : 0,
        ),
      )
      .toBeGreaterThan(0);
    expect((await avatarRead).headers()['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );

    const avatarDelete = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/users/me/avatar') &&
        response.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await avatarDelete;
    await expect(page.getByRole('status')).toHaveText(
      'Your profile photo was removed.',
    );
    await expect(page.getByAltText('Current profile photo')).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length,
      })),
    ).toEqual({ localStorage: 0, sessionStorage: 0 });

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login\?status=signed-out$/);
    await expect(page.getByText('You have been signed out.')).toBeVisible();
    expect(await readSessionCookieMetadata(page)).toBeNull();

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('checkbox', { name: 'Remember me' }).check();
    const rememberedLoginStartedAt = Math.floor(Date.now() / 1_000);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/$/);

    const rememberedCookie = await readSessionCookieMetadata(page);
    expect(rememberedCookie).toMatchObject({
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
    });
    expect(rememberedCookie?.expires).toBeGreaterThanOrEqual(
      rememberedLoginStartedAt +
        THIRTY_DAYS_SECONDS -
        COOKIE_EXPIRY_TOLERANCE_SECONDS,
    );
    expect(rememberedCookie?.expires).toBeLessThanOrEqual(
      Math.ceil(Date.now() / 1_000) +
        THIRTY_DAYS_SECONDS +
        COOKIE_EXPIRY_TOLERANCE_SECONDS,
    );

    await page.getByRole('link', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login\?status=signed-out$/);
    expect(await readSessionCookieMetadata(page)).toBeNull();
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

  test('keeps the account page keyboard-visible, accessible, and reflowed at 320px', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await registerAndSignIn(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const viewport of [
      { height: 900, width: 320 },
      { height: 900, width: 1280 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/account');
      await expect(
        page.getByRole('heading', {
          exact: true,
          name: 'Account Information',
        }),
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

    const fullName = page.getByLabel('Full Name');
    await fullName.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Phone number')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Email')).toBeFocused();

    const avatarInput = page.getByLabel('Choose image');
    await avatarInput.focus();
    await expect(avatarInput).toBeFocused();
    expect(
      await avatarInput.evaluate((input) => {
        const label = input.closest('label');
        return label ? getComputedStyle(label).outlineStyle : 'none';
      }),
    ).not.toBe('none');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login\?status=signed-out$/);
  });

  test('shows the UI-only neutral forgot-password state without a recovery request', async ({
    page,
  }) => {
    await page.goto('/forgot-password');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/login',
    );

    const nonGetRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') nonGetRequests.push(request.url());
    });

    await page.getByLabel('Email').fill('unknown@example.com');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page.getByRole('status')).toContainText(
      'If this email is registered, you will receive a password-reset link.',
    );
    await expect(page.getByLabel('Email')).toHaveCount(0);
    expect(nonGetRequests).toEqual([]);
  });
});

async function registerAndSignIn(page: Page): Promise<void> {
  const email = `a4-accessibility-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const credential = `A1!a${Date.now()}${Math.random().toString(36).slice(2)}`;

  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(credential);
  await page.getByLabel('Confirm Password').fill(credential);
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(credential);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function readSessionCookieMetadata(page: Page) {
  const matches = (await page.context().cookies()).filter(
    ({ name }) => name === 'hb_session' || name === '__Host-hb_session',
  );
  if (matches.length === 0) return null;
  const cookie = matches[0];
  if (matches.length !== 1 || !cookie) {
    throw new Error('Expected exactly one configured session cookie');
  }

  const { expires, httpOnly, name, path, sameSite, secure } = cookie;
  return { expires, httpOnly, name, path, sameSite, secure };
}

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
    await page.getByLabel('Email').fill('brewer@example.com');
    await page.getByLabel('Password').fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Sign In' }).click();
    const authError = page
      .getByRole('alert')
      .filter({ hasText: 'Authentication is temporarily unavailable.' });
    await expect(authError).toContainText(
      'Authentication is temporarily unavailable.',
    );
    await expect(authError).not.toContainText(/csrf|token|stack|fetch/i);
  });
});
