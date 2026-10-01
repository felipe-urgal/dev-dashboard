import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Histórico Git do projeto', () => {
  test('lista commits, alterna escopo e inspeciona commit com teclado', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await expect(page).toHaveURL(/\/projects\/sample-node-app-[a-f0-9]{8}$/);

    const projectPath = new URL(page.url()).pathname;
    await gotoBootstrapped(page, `${projectPath}/git?tab=history`);

    const scope = page.getByLabel('Escopo do histórico');
    const kind = page.getByLabel('Tipo de commit');
    await expect(scope).toHaveValue('exclusive');
    await expect(kind).toHaveValue('all');
    await expect(page.locator('.git-history-count')).toContainText(
      'commits exclusivos',
    );

    const firstCommit = page.locator('.git-history-row').first();
    await expect(firstCommit).toBeVisible();
    await firstCommit.focus();
    await firstCommit.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Detalhes do commit' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.git-history-close')).toBeFocused();
    await expect(dialog.getByText(/Arquivos alterados \(\d+\)/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(firstCommit).toBeFocused();

    await scope.selectOption('all');
    await expect(scope).toHaveValue('all');
    await expect(page.locator('.git-history-count')).not.toContainText(
      'exclusivos',
    );

    await kind.selectOption('merge');
    await expect(kind).toHaveValue('merge');
  });
});
