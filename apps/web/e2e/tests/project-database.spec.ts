import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Banco de dados do projeto', () => {
  test('exibe somente os ambientes do projeto', async ({ page }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'sample-rails-app' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Mais ferramentas' }).click();
    await page.getByRole('menuitem', { name: 'Banco de dados' }).click();

    await expect(
      page.getByRole('heading', { name: 'Ambientes' }),
    ).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Snapshots' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Migrations' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Modelos' })).toHaveCount(0);
    await expect(page.getByText('test')).toBeVisible();
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
