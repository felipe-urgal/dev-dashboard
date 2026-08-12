import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Sidekiq e Webpack do projeto Rails', () => {
  test('gerencia o Sidekiq e esconde a aba de um worker não detectado', async ({
    page,
  }) => {
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

    await page.getByRole('link', { name: 'Sidekiq', exact: true }).click();

    const sidekiqPanel = page.locator('[data-worker-id="sidekiq"]');
    await expect(
      sidekiqPanel.getByRole('button', { name: 'Iniciar' }),
    ).toBeVisible();
    await sidekiqPanel.getByRole('button', { name: 'Iniciar' }).click();

    await expect(
      sidekiqPanel.getByText('Executando', { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      sidekiqPanel.getByRole('button', { name: 'Parar' }),
    ).toBeVisible();

    await sidekiqPanel.getByRole('button', { name: 'Parar' }).click();
    await expect(
      sidekiqPanel.getByText('Parado', { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // webpack-dev-server não é detectado neste projeto de exemplo — a aba
    // não deve aparecer no navegador do projeto.
    await expect(
      page.getByRole('link', { name: 'Webpack', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText('Credentials', { exact: true })).toHaveCount(0);
  });
});
