import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'estreito', width: 375, height: 700 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`largura ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('não produz overflow horizontal e mantém a navegação acessível', async ({ page }) => {
      await gotoBootstrapped(page, '/');
      await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      if (viewport.width > 760) {
        await expect(page.getByRole('link', { name: 'Processos' })).toBeVisible();
      } else {
        await page.getByRole('button', { name: 'Abrir navegação' }).click();
        await expect(page.getByRole('link', { name: 'Visão geral' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Processos' })).toBeVisible();
        await page.getByRole('button', { name: 'Fechar navegação' }).last().click();
      }
      await expect(page.getByRole('group', { name: 'Tema' })).toBeVisible();
    });
  });
}
