import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test('executa lifecycle Dev Container como job e reanexa após reload', async ({
  page,
}) => {
  await gotoBootstrapped(page, '/');
  await page
    .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
    .click();

  await page
    .getByRole('button', { name: 'Desenvolvimento', exact: true })
    .click();
  await page.getByRole('link', { name: 'Dev Container', exact: true }).click();

  await expect(page.locator('.devcontainer-toolbar')).toContainText('Pronto');
  await expect(page.locator('.devcontainer-toolbar')).toContainText('Host');

  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirmar criação', exact: true })
    .click();

  const execution = page.getByLabel('Lifecycle em execução');
  await expect(execution).toContainText('Criação');
  await expect(execution).toContainText('Concluído', { timeout: 15_000 });
  await expect(page.locator('.devcontainer-toolbar')).toContainText('Ativo');
  await expect(page.locator('.devcontainer-toolbar')).toContainText(
    'Dev Container',
  );

  await page.reload();

  await expect(page.locator('.devcontainer-toolbar')).toContainText('Ativo');
  await expect(execution).toContainText('Criação');
  await expect(execution).toContainText('Concluído');
  await expect(
    page.getByRole('button', { name: 'Rebuild', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Parar', exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Rebuild', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirmar rebuild', exact: true })
    .click();

  await expect(execution).toContainText('Rebuild');
  await expect(execution).toContainText('Concluído', { timeout: 15_000 });
  await expect(page.locator('.devcontainer-toolbar')).toContainText('Ativo');

  await page.getByRole('button', { name: 'Parar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirmar parada', exact: true })
    .click();

  await expect(execution).toContainText('Parada');
  await expect(execution).toContainText('Concluído', { timeout: 15_000 });
  await expect(page.locator('.devcontainer-toolbar')).toContainText('Pronto');
  await expect(page.locator('.devcontainer-toolbar')).toContainText('Host');
});
