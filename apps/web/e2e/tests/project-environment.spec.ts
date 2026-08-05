import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Variáveis de ambiente do projeto', () => {
  test('lista variáveis do .env e nunca expõe o valor de um segredo', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await expect(page.getByRole('heading', { level: 3, name: 'sample-node-app' })).toBeVisible();

    await page.getByRole('link', { name: 'Ver detalhes de sample-node-app' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Detalhes do projeto' })).toBeVisible();

    await page.getByRole('link', { name: 'Variáveis de ambiente' }).click();
    await expect(page.getByRole('heading', { level: 3 }).filter({ hasText: '.env' })).toBeVisible();

    await expect(page.getByText('PUBLIC_API_URL')).toBeVisible();
    await expect(page.getByText('https://example.com')).toBeVisible();
    await expect(page.getByText('API_SECRET_TOKEN')).toBeVisible();
    await expect(page.getByText('Oculto (segredo)')).toBeVisible();

    await expect(page.locator('body')).not.toContainText('segredo-de-teste');
  });
});
