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

  test('conecta, escolhe uma tabela, preenche a consulta e executa uma leitura', async ({
    page,
  }) => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    await page.route('**/api/database/explorer/**', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as Record<
        string,
        unknown
      >;
      requests.push({ url: route.request().url(), body });
      const url = route.request().url();
      if (url.endsWith('/catalog')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ databases: [{ name: 'app_development' }] }),
        });
        return;
      }
      if (url.endsWith('/tables')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tables: [{ name: 'posts' }] }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            columns: ['id', 'title'],
            rows: [[1, 'Olá mundo']],
            rowCount: 1,
            truncated: false,
          },
        }),
      });
    });

    await gotoBootstrapped(page, '/database');
    await page.getByRole('button', { name: 'Conectar a um serviço' }).click();
    const connectionDialog = page.getByRole('dialog');
    await connectionDialog.locator('select').selectOption('mysql');
    await connectionDialog.getByLabel('Usuário').fill('root');
    await connectionDialog.getByLabel('Senha').fill('123456');
    await connectionDialog
      .getByRole('button', { name: 'Conectar e continuar' })
      .click();

    await expect(page.getByText('mysql · 127.0.0.1:3306')).toBeVisible();
    await page
      .locator('.database-explorer-sidebar select')
      .selectOption('app_development');
    await expect(page.getByRole('button', { name: 'posts' })).toBeVisible();
    await page.getByRole('button', { name: 'posts' }).click();

    await expect(page.getByText('Olá mundo')).toBeVisible();
    await expect(page.locator('#database-query')).toHaveValue(
      'SELECT * FROM posts',
    );
    await page.getByRole('button', { name: 'Limpar consulta' }).click();
    await expect(page.locator('#database-query')).toHaveValue('SELECT * FROM ');
    await page.locator('#database-query').fill('SELECT * FROM posts');
    await page.getByRole('button', { name: 'Executar leitura' }).click();

    await expect(page.getByText('Olá mundo')).toBeVisible();
    expect(requests.some(({ body }) => body.password === '123456')).toBe(true);
    await page.getByRole('button', { name: 'Trocar conexão' }).click();
    await expect(page.getByRole('dialog').getByLabel('Senha')).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('123456');
  });
});
