import { expect, test } from '@playwright/test';

test('shows the configured Hop & Barley stack status', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Hop & Barley Store' }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    process.env.E2E_EXPECT_API_STATUS ?? 'API connected',
  );

  if (process.env.E2E_EXPECT_API_STATUS === 'API unavailable') {
    await expect(
      page.getByRole('alert').filter({ hasText: 'Products unavailable' }),
    ).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  } else {
    await expect(
      page.getByRole('link', { name: 'Cascade Hops' }),
    ).toHaveAttribute('href', '/product/cascade-hops');
    await expect(page.getByRole('img', { name: 'Cascade hops' })).toBeVisible();
  }
});
