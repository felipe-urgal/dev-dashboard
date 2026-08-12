import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test('a sidebar principal exibe somente navegação e preferências', async ({
  page,
}) => {
  await gotoBootstrapped(page, '/');
  await expect(
    page.getByRole('heading', { level: 3, name: 'sample-node-app' }),
  ).toBeVisible();

  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('.sidebar-tools')).toBeVisible();
  await expect(sidebar.locator('.sidebar-footer')).toHaveCount(0);
  await expect(sidebar).not.toContainText('API conectada');
  await expect(sidebar).not.toContainText('Ambiente local');
});
