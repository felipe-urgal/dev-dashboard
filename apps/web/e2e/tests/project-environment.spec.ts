import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Variáveis de ambiente do projeto', () => {
  test('mascara segredos, reconhece runtime local e revela somente sob demanda', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await expect(
      page.getByRole('heading', { level: 3, name: 'sample-node-app' }),
    ).toBeVisible();

    const projectLink = page.getByRole('link', {
      name: 'Ver detalhes de sample-node-app',
      exact: true,
    });
    const href = await projectLink.getAttribute('href');
    if (!href) throw new Error('Projeto Node da fixture não foi encontrado.');
    await gotoBootstrapped(page, `${href}/environment`);

    await expect(
      page.getByRole('region', { name: 'Arquivo .env' }),
    ).toBeVisible();

    await expect(
      page.getByRole('rowheader', { name: 'PUBLIC_API_URL' }),
    ).toBeVisible();
    await expect(page.getByText('https://example.com')).toBeVisible();
    await expect(
      page.getByRole('rowheader', { name: 'API_SECRET_TOKEN' }),
    ).toBeVisible();
    await expect(
      page.getByRole('rowheader', { name: 'DATABASE_URL' }),
    ).toBeVisible();
    await expect(page.getByText('Segredo').first()).toBeVisible();

    await expect(page.locator('body')).not.toContainText('segredo-de-teste');
    await expect(page.locator('body')).not.toContainText('senha-e2e');

    await page
      .getByRole('button', { name: 'Exibir valor de DATABASE_URL' })
      .click();
    await expect(
      page.getByText('postgres://admin:senha-e2e@localhost/app'),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Ocultar valor de DATABASE_URL' })
      .click();
    await expect(page.locator('body')).not.toContainText('senha-e2e');

    await page
      .getByRole('button', {
        name: /\.dev-dashboard\/\.env\.production\.local/u,
      })
      .click();
    await expect(page.getByText('runtime produção')).toBeVisible();
    await expect(
      page.getByRole('rowheader', { name: 'DATABASE_URL' }),
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText('prod-secret');
  });
});
