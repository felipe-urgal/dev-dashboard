import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test('a sidebar principal mantém sua aparência visual', async ({ page }) => {
  await gotoBootstrapped(page, '/');
  await expect(
    page.getByRole('heading', { level: 3, name: 'sample-node-app' }),
  ).toBeVisible();

  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toHaveScreenshot('sidebar-dark-comfortable.png', {
    maxDiffPixelRatio: 0.01,
  });
});
