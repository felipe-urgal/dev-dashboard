import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('Privacidade e sessão do Query Explorer', () => {
  test('SQL recente fica na aba, consulta salva exige ação explícita e desconectar limpa o resultado', async ({
    page,
  }) => {
    const deletedSessions: string[] = [];

    await page.route('**/api/database/explorer/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const respond = async (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });

      if (
        pathname === '/api/database/explorer/sessions' &&
        request.method() === 'POST'
      ) {
        await respond(
          {
            sessionId: 'privacy-session',
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          },
          201,
        );
      } else if (pathname.endsWith('/sessions/catalog')) {
        await respond({ databases: [{ name: 'app_development' }] });
      } else if (pathname.endsWith('/sessions/tables')) {
        await respond({ tables: [{ name: 'users' }] });
      } else if (pathname.endsWith('/sessions/preview')) {
        await respond({
          result: {
            columns: ['email'],
            rows: [['old@example.test']],
            rowCount: 1,
            truncated: false,
          },
        });
      } else if (pathname.endsWith('/sessions/query')) {
        await respond({
          result: {
            columns: ['email'],
            rows: [['private@example.test']],
            rowCount: 1,
            truncated: false,
          },
        });
      } else if (request.method() === 'DELETE') {
        deletedSessions.push(pathname);
        await route.fulfill({ status: 204, body: '' });
      } else {
        await respond({ error: 'NOT_FOUND' }, 404);
      }
    });

    await gotoBootstrapped(page, '/database');
    await page.getByRole('tab', { name: 'Explorador de dados' }).click();
    await page.getByRole('button', { name: 'Conectar a um serviço' }).click();
    const dialog = page.getByRole('dialog', { name: 'Conectar a um serviço' });
    await dialog.getByLabel('Usuário').fill('dev');
    await dialog.getByLabel('Senha').fill('secret-for-e2e');
    await dialog.getByRole('button', { name: 'Conectar e continuar' }).click();
    await expect(page.getByText('postgresql · 127.0.0.1:5432')).toBeVisible();

    await page
      .locator('.database-explorer-sidebar select')
      .selectOption('app_development');
    await page.getByRole('button', { name: 'users' }).click();
    await expect(page.getByText('old@example.test')).toBeVisible();

    const sql = "SELECT email FROM users WHERE email = 'private@example.test'";
    await page.locator('#database-query').fill(sql);
    await page.getByRole('button', { name: 'Executar leitura' }).click();
    await expect(page.getByText('private@example.test')).toBeVisible();

    const persistedBeforeSave = await page.evaluate(() => ({
      legacy: localStorage.getItem('dev-dashboard.database-query-history'),
      saved: localStorage.getItem('dev-dashboard.database-saved-queries'),
      recent: sessionStorage.getItem('dev-dashboard.database-recent-queries'),
      connections: localStorage.getItem('dev-dashboard.database-connections'),
    }));
    expect(persistedBeforeSave.legacy).toBeNull();
    expect(persistedBeforeSave.saved).toBeNull();
    expect(persistedBeforeSave.recent).toContain(sql);
    expect(JSON.stringify(persistedBeforeSave)).not.toContain('secret-for-e2e');

    await page.getByRole('button', { name: 'Histórico' }).click();
    await expect(
      page.getByText('Consultas salvas permanecem neste navegador'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Salvar consulta permanentemente' })
      .click();
    expect(
      await page.evaluate(() =>
        localStorage.getItem('dev-dashboard.database-saved-queries'),
      ),
    ).toContain(sql);

    // Nova aba sem opener compartilha localStorage, mas não sessionStorage.
    const newTab = await page.context().newPage();
    await gotoBootstrapped(newTab, '/database');
    const otherTabStorage = await newTab.evaluate(() => ({
      recent: sessionStorage.getItem('dev-dashboard.database-recent-queries'),
      saved: localStorage.getItem('dev-dashboard.database-saved-queries'),
    }));
    expect(otherTabStorage.recent).toBeNull();
    expect(otherTabStorage.saved).toContain(sql);
    await newTab.close();

    await page.getByRole('button', { name: 'Desconectar' }).click();
    await expect(page.getByText('Nenhuma conexão ativa')).toBeVisible();
    await expect(page.getByText('private@example.test')).toHaveCount(0);
    await expect(page.getByText('old@example.test')).toHaveCount(0);
    expect(deletedSessions).toContain(
      '/api/database/explorer/sessions/privacy-session',
    );
  });
});
