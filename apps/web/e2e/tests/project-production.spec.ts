import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('produção por projeto', () => {
  test('mostra Produção somente para projeto com capability válida', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');

    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    const nodeProjectTabs = page.getByRole('navigation', {
      name: 'Áreas do projeto',
    });
    await expect(
      nodeProjectTabs.getByRole('link', { name: 'Produção', exact: true }),
    ).toBeVisible();

    await page.goto('/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    const railsProjectTabs = page.getByRole('navigation', {
      name: 'Áreas do projeto',
    });
    await expect(
      railsProjectTabs.getByRole('link', { name: 'Produção', exact: true }),
    ).toHaveCount(0);
  });

  test('faz preview antes da confirmação e acompanha deployment command', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await page
      .getByRole('navigation', { name: 'Áreas do projeto' })
      .getByRole('link', { name: 'Produção', exact: true })
      .click();

    await expect(
      page.getByRole('heading', { name: 'Produção pronta para planejar' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Preparar deployment' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Preparar deployment' }).click();
    await expect(
      page.getByRole('heading', { name: 'Revisar antes de publicar' }),
    ).toBeVisible();
    await expect(page.getByText('prod:deploy', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Destino', { exact: true }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Iniciar deployment' })
      .click();

    await expect(
      page.getByRole('heading', { name: 'Produção atualizada' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText('Detalhes da última execução', { exact: true }),
    ).toBeVisible();
    await page
      .getByText('Detalhes da última execução', { exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Timeline do deployment' }),
    ).toBeVisible();
  });
});
