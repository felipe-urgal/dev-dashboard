import { expect, test } from '@playwright/test';

import { gotoBootstrapped, openProjectTool } from '../fixtures/navigate';

test.describe('estabilidade do shell e dos terminais', () => {
  test('abre o modal de workspace', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await page.getByRole('button', { name: /Workspace ativo/ }).click();
    await page.getByText('Adicionar workspace…').click();

    const dialog = page.locator('.workspace-manager-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('inicia uma sessão de terminal', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await openProjectTool(page, 'Execução', 'Terminal');
    const terminal = page.locator('.terminal-frame');
    await expect(terminal).toBeVisible();
    await expect(terminal.locator('.xterm')).toBeVisible();
  });
});
