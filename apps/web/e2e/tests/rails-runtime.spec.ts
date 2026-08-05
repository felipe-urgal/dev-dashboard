import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Sidekiq/webpack do projeto Rails', () => {
  test('inicia e para o Sidekiq, e mostra webpack e credentials como ausentes', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await expect(page.getByRole('heading', { level: 3, name: 'sample-rails-app' })).toBeVisible();

    await page.getByRole('link', { name: 'Ver detalhes de sample-rails-app' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Detalhes do projeto' })).toBeVisible();

    await page.getByRole('link', { name: 'Sidekiq/webpack' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Sidekiq' })).toBeVisible();

    const sidekiqCard = page.locator('.rails-worker-card', { has: page.getByRole('heading', { level: 3, name: 'Sidekiq' }) });
    const webpackCard = page.locator('.rails-worker-card', { has: page.getByRole('heading', { level: 3, name: 'webpack-dev-server' }) });

    await expect(webpackCard.getByText('Não encontramos indícios de webpack-dev-server')).toBeVisible();

    await expect(sidekiqCard.getByRole('button', { name: 'Iniciar' })).toBeVisible();
    await sidekiqCard.getByRole('button', { name: 'Iniciar' }).click();

    await expect(sidekiqCard.getByText('Executando')).toBeVisible({ timeout: 15_000 });
    await expect(sidekiqCard.getByRole('button', { name: 'Parar' })).toBeVisible();

    await sidekiqCard.getByRole('button', { name: 'Parar' }).click();
    await expect(sidekiqCard.getByText('Parado')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('Este projeto não possui')).toBeVisible();
  });
});
