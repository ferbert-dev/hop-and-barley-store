import { expect, test } from '@playwright/test';

test('shows the connected Hop & Barley stack', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Hop & Barley Store' }),
  ).toBeVisible();
  await expect(page.getByText('API connected')).toBeVisible();
});
