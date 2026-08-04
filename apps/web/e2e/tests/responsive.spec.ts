import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

const SIDEBAR_DRAWER_MAX_WIDTH = 900;
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'dev-dashboard:primary-sidebar-collapsed';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'estreito', width: 375, height: 700 },
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
}

for (const viewport of VIEWPORTS) {
  test.describe(`largura ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('não produz overflow horizontal e mantém a navegação acessível', async ({ page }) => {
      if (viewport.name === 'tablet') {
        await page.addInitScript(({ storageKey }) => {
          localStorage.setItem(storageKey, 'true');
        }, { storageKey: SIDEBAR_COLLAPSED_STORAGE_KEY });
      }

      await gotoBootstrapped(page, '/');
      await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const menuButton = page.getByRole('button', { name: 'Abrir navegação' });

      if (viewport.width > SIDEBAR_DRAWER_MAX_WIDTH) {
        await expect(menuButton).toBeHidden();
        await expect(page.getByRole('link', { name: 'Processos' })).toBeVisible();
      } else {
        await expect(menuButton).toBeVisible();
        await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

        await menuButton.click();

        await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByRole('combobox', { name: 'Trocar workspace ativo' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Visão geral' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Processos' })).toBeVisible();
        await expect(page.getByRole('button', { name: /^(Expandir|Recolher) navegação$/ })).toBeHidden();

        await page.getByRole('link', { name: 'Processos' }).click();

        await expect(page.getByRole('heading', { level: 1, name: 'Processos' })).toBeVisible();
        await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
        await expectNoHorizontalOverflow(page);
      }

      await expect(page.getByRole('group', { name: 'Tema' })).toBeVisible();
    });
  });
}
