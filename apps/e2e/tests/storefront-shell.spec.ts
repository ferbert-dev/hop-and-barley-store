import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  qualityGates,
  viewportProbes,
} from '../../web/src/quality/acceptance-matrix';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function waitForShellAssets(page: Page) {
  const images = await page
    .locator('.site-header img:visible, .site-footer img:visible')
    .all();
  expect(
    images.length,
    'storefront shell must render its image assets',
  ).toBeGreaterThan(0);

  for (const image of images) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const imageElement = element as HTMLImageElement;

          return imageElement.complete && imageElement.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }
}

test('supports the mobile disclosure with keyboard-only navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await page.getByRole('button', { name: 'Open menu' }).focus();
  await page.keyboard.press('Enter');
  const trigger = page.getByRole('button', { name: 'Close menu' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Tab');
  await expect(
    page
      .getByRole('navigation', { name: 'Storefront' })
      .getByRole('link', { name: 'Products', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('closes the inline disclosure when crossing the wide breakpoint', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1023, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(
    page.getByRole('button', { name: 'Close menu' }),
  ).toHaveAttribute('aria-expanded', 'true');

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  await expect(
    page.getByRole('navigation', { name: 'Storefront' }),
  ).toBeVisible();
});

test('does not reopen the disclosure after cart navigation and browser Back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page
    .getByRole('navigation', { name: 'Storefront' })
    .getByRole('link', { name: 'Shopping cart' })
    .click();
  await expect(page).toHaveURL(/\/cart$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('has no unexpected horizontal overflow at every Q1 viewport probe', async ({
  page,
}) => {
  for (const probe of viewportProbes) {
    await page.setViewportSize({ width: probe.width, height: probe.height });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Hop & Barley Store' }),
    ).toBeAttached();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `${probe.id} must stay within the Q1 overflow gate`,
    ).toBeLessThanOrEqual(
      qualityGates.overflow.maximumUnexpectedHorizontalOverflowCssPx,
    );

    const brandBox = await page
      .getByRole('link', { name: 'Hop and Barley home' })
      .boundingBox();
    expect(
      brandBox,
      `${probe.id} brand target must be measurable`,
    ).not.toBeNull();
    expect(
      brandBox!.height,
      `${probe.id} brand target height`,
    ).toBeGreaterThanOrEqual(qualityGates.pointerTarget.minimumHeightCssPx);
  }
});

test('loads shell assets and exposes the landmark structure', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await waitForShellAssets(page);
  await expect(
    page.getByRole('banner', { name: 'Hop and Barley storefront' }),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Storefront' }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.getByRole('contentinfo', { name: 'Store information' }),
  ).toBeVisible();
});

test('honours the reduced-motion contract', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const motion = await page.evaluate(() => ({
    htmlScrollBehavior: getComputedStyle(document.documentElement)
      .scrollBehavior,
    menuTransitionDuration: getComputedStyle(
      document.querySelector('.menu-trigger__icon span')!,
    ).transitionDuration,
    skipTransitionDuration: getComputedStyle(
      document.querySelector('.skip-link')!,
    ).transitionDuration,
  }));

  expect(motion.htmlScrollBehavior).toBe(
    qualityGates.reducedMotion.scrollBehavior,
  );
  expect(motion.menuTransitionDuration).toBe('0s');
  expect(motion.skipTransitionDuration).toBe('0s');
});

test('has no critical or serious axe violations in closed and open shell states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  for (const state of ['closed', 'open'] as const) {
    if (state === 'open') {
      await page.getByRole('button', { name: 'Open menu' }).click();
    }

    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    const blockingViolations = results.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    );

    expect(blockingViolations, `${state} shell axe results`).toEqual([]);
  }
});

test('renders the configured API availability state without changing the shell', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('status')).toHaveText(
    process.env.E2E_EXPECT_API_STATUS ?? 'API connected',
  );
  await expect(
    page.getByRole('banner', { name: 'Hop and Barley storefront' }),
  ).toBeVisible();
  await expect(
    page.getByRole('contentinfo', { name: 'Store information' }),
  ).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await waitForShellAssets(page);
});
