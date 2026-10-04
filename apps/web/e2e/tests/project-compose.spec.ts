import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test('executa lifecycle Compose como job confirmado e reanexa após reload', async ({
  page,
}) => {
  await gotoBootstrapped(page, '/');
  await page
    .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
    .click();

  await page
    .getByRole('button', { name: 'Desenvolvimento', exact: true })
    .click();
  await page.getByRole('link', { name: 'Compose', exact: true }).click();

  const panel = page.getByRole('region', {
    name: 'Docker Compose',
    exact: true,
  });
  await expect(panel).toContainText('Stack parada');
  await expect(
    page.getByRole('button', { name: 'Iniciar stack', exact: true }),
  ).toBeEnabled();

  await page
    .getByRole('button', { name: 'Iniciar stack', exact: true })
    .click();
  await expect(
    page.getByLabel('Confirmar operação Docker Compose'),
  ).toContainText('Iniciar a stack?');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

  const execution = page.getByLabel('Lifecycle Docker Compose');
  await expect(execution).toContainText('Concluído', { timeout: 15_000 });
  await expect(panel).toContainText('Stack rodando');

  await page.reload();

  await expect(panel).toContainText('Stack rodando');
  await expect(execution).toContainText('Concluído');

  await page.getByLabel('Ações de web').click();
  await page.getByRole('button', { name: 'Ver logs', exact: true }).click();
  await expect(panel).toContainText('compose fixture ready');

  await page
    .getByRole('button', { name: 'Reiniciar stack', exact: true })
    .click();
  await expect(
    page.getByLabel('Confirmar operação Docker Compose'),
  ).toContainText('Reiniciar a stack?');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(execution).toContainText('Concluído', { timeout: 15_000 });
  await expect(panel).toContainText('Stack rodando');

  await page.getByRole('button', { name: 'Parar stack', exact: true }).click();
  await expect(
    page.getByLabel('Confirmar operação Docker Compose'),
  ).toContainText('Parar a stack?');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(execution).toContainText('Concluído', { timeout: 15_000 });
  await expect(panel).toContainText('Stack parada');
});
