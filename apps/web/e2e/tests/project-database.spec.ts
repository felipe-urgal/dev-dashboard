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
    const requests: Array<{
      method: string;
      pathname: string;
      body: Record<string, unknown>;
    }> = [];
    let sessionCreationCount = 0;

    await page.route('**/api/database/explorer/**', async (route) => {
      const request = route.request();
      const method = request.method();
      const pathname = new URL(request.url()).pathname;
      const body = JSON.parse(request.postData() ?? '{}') as Record<
        string,
        unknown
      >;
      requests.push({ method, pathname, body });

      if (method === 'POST' && pathname === '/api/database/explorer/sessions') {
        sessionCreationCount += 1;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            sessionId:
              sessionCreationCount === 1 ? 'test-session' : 'active-session',
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          }),
        });
        return;
      }

      if (
        method === 'DELETE' &&
        pathname.startsWith('/api/database/explorer/sessions/')
      ) {
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      if (pathname.endsWith('/sessions/catalog')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ databases: [{ name: 'app_development' }] }),
        });
        return;
      }

      if (pathname.endsWith('/sessions/tables')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tables: [
              { name: 'posts' },
              ...Array.from({ length: 44 }, (_, index) => ({
                name: `table_${index + 1}`,
              })),
            ],
          }),
        });
        return;
      }

      if (
        pathname.endsWith('/sessions/preview') ||
        pathname.endsWith('/sessions/query')
      ) {
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
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'NOT_FOUND' }),
      });
    });

    await gotoBootstrapped(page, '/database');
    await page.getByRole('button', { name: 'Conectar a um serviço' }).click();
    const connectionDialog = page.getByRole('dialog');
    await connectionDialog.locator('select').selectOption('mysql');
    await connectionDialog.getByLabel('Usuário').fill('root');
    await connectionDialog.getByLabel('Senha').fill('123456');
    await connectionDialog
      .getByRole('button', { name: 'Testar conexão' })
      .click();
    await expect(
      connectionDialog.getByText('Conexão validada.', { exact: false }),
    ).toBeVisible();
    await connectionDialog
      .getByRole('button', { name: 'Salvar sem senha' })
      .click();
    await expect(
      connectionDialog.getByText('Conexão salva sem armazenar a senha.'),
    ).toBeVisible();
    await connectionDialog
      .getByRole('button', { name: 'Conectar e continuar' })
      .click();

    await expect(page.getByText('mysql · 127.0.0.1:3306')).toBeVisible();
    await page
      .locator('.database-explorer-sidebar select')
      .selectOption('app_development');
    await expect(page.getByText('Página 1 de 2')).toBeVisible();
    await page.getByRole('button', { name: 'Próxima' }).click();
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await page.getByPlaceholder('Nome da tabela').fill('posts');
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

    const sessionCreations = requests.filter(
      ({ method, pathname }) =>
        method === 'POST' && pathname === '/api/database/explorer/sessions',
    );
    expect(sessionCreations).toHaveLength(2);
    expect(
      sessionCreations.every(({ body }) => body.password === '123456'),
    ).toBe(true);
    expect(
      requests.some(
        ({ method, pathname }) =>
          method === 'DELETE' &&
          pathname === '/api/database/explorer/sessions/test-session',
      ),
    ).toBe(true);

    const sessionOperations = requests.filter(({ pathname }) =>
      [
        '/api/database/explorer/sessions/catalog',
        '/api/database/explorer/sessions/tables',
        '/api/database/explorer/sessions/preview',
        '/api/database/explorer/sessions/query',
      ].includes(pathname),
    );
    expect(sessionOperations.length).toBeGreaterThan(0);
    for (const { body } of sessionOperations) {
      expect(body.sessionId).toBeDefined();
      expect(body).not.toHaveProperty('password');
      expect(body).not.toHaveProperty('username');
      expect(body).not.toHaveProperty('host');
      expect(body).not.toHaveProperty('port');
      expect(body).not.toHaveProperty('driver');
    }
    expect(
      sessionOperations.some(
        ({ pathname, body }) =>
          pathname === '/api/database/explorer/sessions/query' &&
          body.sessionId === 'active-session',
      ),
    ).toBe(true);

    await page.getByRole('button', { name: 'Trocar conexão' }).click();
    await expect(
      page.getByRole('dialog').getByRole('combobox').first(),
    ).toContainText('mysql');
    await expect(page.getByRole('dialog').getByLabel('Senha')).toHaveValue('');
    await expect(page.locator('body')).not.toContainText('123456');
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('dev-dashboard.database-connections'),
      ),
    ).not.toContain('password');
  });
});
