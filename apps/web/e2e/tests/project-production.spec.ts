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
    await expect(
      page.getByRole('link', { name: 'Produção', exact: true }),
    ).toBeVisible();

    await page.goto('/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await expect(
      page.getByRole('link', { name: 'Produção', exact: true }),
    ).toHaveCount(0);
  });

  test('faz preview antes da confirmação e acompanha deployment command', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await page.getByRole('link', { name: 'Produção', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: 'Produção pronta para planejar' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Preparar deployment' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Preparar deployment' }).click();
    await expect(
      page.getByRole('heading', { name: 'Revise o plano antes de executar' }),
    ).toBeVisible();
    await expect(page.getByText('prod:deploy', { exact: true })).toBeVisible();
    await expect(page.getByText('Revision alvo', { exact: true })).toBeVisible();

    await page
      .getByRole('button', { name: 'Confirmar e iniciar deployment' })
      .click();

    await expect(
      page.getByRole('heading', { name: 'Último deployment concluído' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('heading', { name: 'Timeline do deployment' }),
    ).toBeVisible();
    await expect(
      page.getByText('Último verify passou', { exact: true }),
    ).toBeVisible();
  });
});
