import { expect, test } from '@playwright/test';

import { gotoBootstrapped, openProjectTool } from '../fixtures/navigate';

test('executa testes por PTY, restaura após reload e registra histórico', async ({
  page,
}) => {
  await gotoBootstrapped(page, '/');
  await page
    .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
    .click();

  await openProjectTool(page, 'Desenvolvimento', 'Testes');

  const command = page.getByLabel('Comando de teste');
  await expect(command).toContainText('test');

  await page.getByRole('button', { name: 'Executar testes' }).click();

  const executionState = page.locator('.tests-execution-state');
  await expect(executionState).toHaveText('Sucesso', { timeout: 15_000 });
  const selectedBeforeReload = await command.inputValue();
  expect(selectedBeforeReload).not.toBe('');

  await page.reload();

  await expect(page.getByLabel('Comando de teste')).toHaveValue(
    selectedBeforeReload,
  );
  await expect(page.locator('.tests-execution-state')).toHaveText('Sucesso');

  await page.locator('.tests-context > summary').click();

  const history = page.getByLabel('Histórico de testes');
  await expect(history).toContainText('Sucesso');
  await expect(history).toContainText(selectedBeforeReload);
});
