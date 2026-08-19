import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Banco de dados da máquina', () => {
  test('exibe os serviços de banco fora do contexto do projeto', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/database');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Banco de dados' }),
    ).toBeVisible();
    await expect(
      page.getByText('Gerencie os bancos instalados no sistema', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByText('MySQL', { exact: true })).toBeVisible();
    await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible();
  });

  test('o projeto não oferece banco de dados como ferramenta local', async ({
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
      page
        .locator('.project-details-tabs')
        .getByRole('link', { name: 'Banco de dados' }),
    ).toHaveCount(0);
  });
});
