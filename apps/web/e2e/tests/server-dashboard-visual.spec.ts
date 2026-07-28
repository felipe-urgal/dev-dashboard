import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test('captura a aba de servidor para revisão visual', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await gotoBootstrapped(page, '/');

  await page.getByRole('button', { name: 'Claro', exact: true }).click();

  const projectHeading = page.getByRole('heading', {
    level: 3,
    name: 'sample-node-app',
  });

  await expect(projectHeading).toBeVisible();
  await projectHeading.locator('xpath=ancestor::a[1]').click();

  await page.getByRole('link', { name: 'Servidor', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Configuração do servidor' }),
  ).toBeVisible();

  await page.screenshot({
    path: 'e2e/.runtime/server-dashboard.png',
    fullPage: true,
  });
});
