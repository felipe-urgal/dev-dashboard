import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

async function rootAttributes(page: Page) {
  return page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
  }));
}

test.describe('tema', () => {
  test('padrão é escuro', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await expect.poll(() => rootAttributes(page)).toEqual({ theme: 'dark' });
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
});
