import { expect, test } from '@playwright/test';

import { gotoBootstrapped, openProjectTool } from '../fixtures/navigate';

test('executa testes por PTY, restaura após reload e registra histórico', async ({
  page,
}) => {
  await gotoBootstrapped(page, '/');
  await page
    .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
    .click();

  await openProjectTool(page, 'Execução', 'Testes');

  await page.getByRole('button', { name: 'Executar todos' }).click();

  await expect(
    page.locator('.tests-toolbar').getByText('Sucesso', { exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  await page.reload();

  await expect(
    page.locator('.tests-toolbar').getByText('Sucesso', { exact: true }),
  ).toBeVisible();

  await page.getByRole('tab', { name: /Histórico/ }).click();
  await expect(page.locator('.tests-history')).toContainText('Sucesso');
  await expect(page.locator('.tests-history')).toContainText('Todos os testes');
});
