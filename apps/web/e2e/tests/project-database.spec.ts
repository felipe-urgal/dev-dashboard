import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Banco de dados do projeto', () => {
  test('gera e restaura um snapshot', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await expect(
      page.getByRole('heading', { level: 3, name: 'sample-rails-app' }),
    ).toBeVisible();

    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'sample-rails-app' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Banco de dados' }).click();
    await page.getByRole('tab', { name: 'Snapshots' }).click();

    await expect(
      page.getByText(
        'Nenhum ambiente MySQL ou PostgreSQL foi detectado neste projeto',
      ),
    ).not.toBeVisible();
    await expect(page.getByText('Nenhum snapshot guardado.')).toBeVisible();

    const generateButton = page.getByRole('button', {
      name: 'Gerar snapshot',
    });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    await expect(page.getByRole('status')).toContainText('criado');
    const snapshotItem = page.locator('.database-snapshot-list li').first();
    await expect(snapshotItem).toBeVisible();
    await expect(snapshotItem).toContainText('sample_rails_development');

    await snapshotItem.getByRole('button', { name: 'Restaurar' }).click();
    await expect(
      snapshotItem.getByText('Restaurar sobrescreve o banco atual.'),
    ).toBeVisible();

    await snapshotItem.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('status')).toContainText('estaurad');
  });

  test('cancela a confirmação de restore sem chamar a API', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await page.getByRole('link', { name: 'Banco de dados' }).click();
    await page.getByRole('tab', { name: 'Snapshots' }).click();

    await page.getByRole('button', { name: 'Gerar snapshot' }).click();
    await expect(page.getByRole('status')).toContainText('criado');

    const snapshotItem = page.locator('.database-snapshot-list li').first();
    await expect(snapshotItem).toBeVisible();
    await expect(snapshotItem).toContainText('sample_rails_development');

    await snapshotItem.getByRole('button', { name: 'Restaurar' }).click();
    await expect(
      snapshotItem.getByText('Restaurar sobrescreve o banco atual.'),
    ).toBeVisible();

    await snapshotItem.getByRole('button', { name: 'Cancelar' }).click();
    await expect(
      snapshotItem.getByText('Restaurar sobrescreve o banco atual.'),
    ).not.toBeVisible();
    await expect(
      snapshotItem.getByRole('button', { name: 'Restaurar' }),
    ).toBeVisible();
  });

  test('sample-node-app não oferece a aba de banco de dados (sem banco detectado)', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'sample-node-app' }),
    ).toBeVisible();

    await expect(
      page.getByRole('link', { name: 'Banco de dados' }),
    ).not.toBeVisible();
  });
});
