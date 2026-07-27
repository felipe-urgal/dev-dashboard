import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

async function rootAttributes(page: Page) {
  return page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    density: document.documentElement.dataset.density,
  }));
}

test.describe('tema e densidade', () => {
  test('padrão é escuro e cômodo', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await expect.poll(() => rootAttributes(page)).toEqual({ theme: 'dark', density: 'comfortable' });
  });

  for (const [label, theme] of [
    ['Escuro', 'dark'],
    ['Claro', 'light'],
  ] as const) {
    test(`troca de tema para ${theme} aplica e persiste após recarregar`, async ({ page }) => {
      await gotoBootstrapped(page, '/');

      await page
        .getByRole('group', { name: 'Tema' })
        .getByRole('button', { name: label })
        .click();

      await expect.poll(() => rootAttributes(page)).toMatchObject({ theme });

      await page.reload();
      await expect.poll(() => rootAttributes(page)).toMatchObject({ theme });
    });
  }

  for (const [label, density] of [
    ['Cômoda', 'comfortable'],
    ['Compacta', 'compact'],
  ] as const) {
    test(`troca de densidade para ${density} aplica e persiste após recarregar`, async ({ page }) => {
      await gotoBootstrapped(page, '/');

      await page
        .getByRole('group', { name: 'Densidade' })
        .getByRole('button', { name: label })
        .click();

      await expect.poll(() => rootAttributes(page)).toMatchObject({ density });

      await page.reload();
      await expect.poll(() => rootAttributes(page)).toMatchObject({ density });
    });
  }
});
