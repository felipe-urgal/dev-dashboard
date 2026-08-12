import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Sidekiq e Webpack do projeto Rails', () => {
  test('gerencia o Sidekiq e mantém o Webpack em uma aba separada', async ({
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

    await expect(
      page.getByRole('heading', { level: 3, name: 'Sidekiq' }),
    ).toBeVisible();

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

    await page.getByRole('link', { name: 'Webpack', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 3, name: 'webpack-dev-server' }),
    ).toBeVisible();
    await expect(
      page.getByText('webpack-dev-server não foi detectado.'),
    ).toBeVisible();
    await expect(page.getByText('Credentials', { exact: true })).toHaveCount(0);
  });
});
