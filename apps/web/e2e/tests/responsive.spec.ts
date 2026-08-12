import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

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

    test('não produz overflow horizontal e mantém a navegação acessível', async ({
      page,
    }) => {
      if (viewport.name === 'tablet') {
        await page.addInitScript(
          ({ storageKey }) => {
            localStorage.setItem(storageKey, 'true');
          },
          { storageKey: SIDEBAR_COLLAPSED_STORAGE_KEY },
        );
      }

      await gotoBootstrapped(page, '/');
      await expect(
        page.getByRole('combobox', { name: 'Trocar workspace ativo' }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await expect(page.getByRole('link', { name: 'Processos' })).toBeVisible();

      await page.getByRole('link', { name: 'Processos' }).click();

      await expect(page.getByRole('link', { name: 'Processos' })).toHaveClass(
        /navigation-item-active/,
      );
      await expectNoHorizontalOverflow(page);

      await expect(page.getByRole('group', { name: 'Tema' })).toBeVisible();
    });
  });
}
