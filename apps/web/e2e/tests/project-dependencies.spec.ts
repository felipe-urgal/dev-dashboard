import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test('executa build confirmado por PTY e restaura o resultado após reload', async ({
  page,
}) => {
  await gotoBootstrapped(page, '/');
  await page
    .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
    .click();

  await page
    .getByRole('button', { name: 'Desenvolvimento', exact: true })
    .click();
  await page.getByRole('link', { name: 'Dependências', exact: true }).click();

  await expect(page.getByLabel('Saúde das dependências')).toContainText('npm');
  await expect(page.getByLabel('Saúde das dependências')).toContainText(
    '0 deps',
  );

  const buildRow = page
    .locator('.dependencies-action-row')
    .filter({ hasText: 'npm run build' });
  await expect(buildRow).toBeVisible();

  await buildRow.getByRole('button', { name: 'Executar', exact: true }).click();
  await page.getByRole('button', { name: 'Executar ação' }).click();

  const executionState = page.locator('.dependencies-execution-state');
  await expect(executionState).toContainText('Executando');
  await expect(executionState).toContainText('Sucesso', { timeout: 15_000 });
  await expect(page.locator('.dependencies-console-header')).toContainText(
    'build',
  );

  await page.reload();

  await expect(page.locator('.dependencies-execution-state')).toContainText(
    'Sucesso',
  );
  await expect(
    page.locator('.dependencies-action-row.is-active'),
  ).toContainText('npm run build');
  await expect(page.locator('.dependencies-console-header')).toContainText(
    'exit 0',
  );
});
