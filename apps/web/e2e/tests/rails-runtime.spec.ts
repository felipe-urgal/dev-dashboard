import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Sidekiq e Webpack do projeto Rails', () => {
  test('gerencia Sidekiq e Webpack detectados', async ({
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

    await expect(
      sidekiqPanel.getByText('Ao vivo', { exact: true }),
    ).toBeVisible();
    await expect(
      sidekiqPanel.getByRole('button', { name: 'Reiniciar' }),
    ).toBeVisible();

    await sidekiqPanel.getByRole('button', { name: 'Reiniciar' }).click();
    await expect(
      sidekiqPanel.getByText('Executando', { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await sidekiqPanel.getByRole('button', { name: 'Parar' }).click();
    await expect(
      sidekiqPanel.getByText('Parado', { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const webpackLink = page.getByRole('link', {
      name: 'Webpack',
      exact: true,
    });
    await expect(webpackLink).toBeVisible();
    await webpackLink.click();

    const webpackPanel = page.locator('[data-worker-id="webpack"]');
    await expect(
      webpackPanel.getByRole('button', { name: 'Iniciar' }),
    ).toBeVisible();
    await expect(
      webpackPanel.getByRole('button', { name: 'Reiniciar' }),
    ).toHaveCount(0);

    await webpackPanel.getByRole('button', { name: 'Iniciar' }).click();
    await expect(
      webpackPanel.getByText('Executando', { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      webpackPanel.getByText('Ao vivo', { exact: true }),
    ).toBeVisible();
    await expect(webpackPanel.getByText('webpack fixture ready')).toBeVisible({
      timeout: 15_000,
    });

    await webpackPanel.getByRole('button', { name: 'Parar' }).click();
    await expect(
      webpackPanel.getByText('Parado', { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('Credentials', { exact: true })).toHaveCount(0);
  });
});
