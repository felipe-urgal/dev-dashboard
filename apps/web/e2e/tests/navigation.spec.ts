import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('navegação principal', () => {
  test('painel de visão geral renderiza com o projeto de fixture', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await expect(
      page.locator('#repositories').getByText('Repositórios', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Projetos detectados' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 3, name: 'sample-node-app' }),
    ).toBeVisible();
  });

  test('desativa o projeto e preserva a preferência após recarregar', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');

    const disableButton = page.getByRole('button', {
      name: 'Desativar sample-node-app',
    });
    await expect(disableButton).toHaveAttribute('aria-pressed', 'false');

    await disableButton.click();

    const enableButton = page.getByRole('button', {
      name: 'Ativar sample-node-app',
    });
    await expect(enableButton).toHaveAttribute('aria-pressed', 'true');

    await page.reload();

    const persistedEnableButton = page.getByRole('button', {
      name: 'Ativar sample-node-app',
    });
    await expect(persistedEnableButton).toHaveAttribute('aria-pressed', 'true');

    await persistedEnableButton.click();
    await expect(
      page.getByRole('button', { name: 'Desativar sample-node-app' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('página global de processos renderiza', async ({ page }) => {
    await gotoBootstrapped(page, '/processes');
    await expect(
      page.getByRole('region', { name: 'Processos gerenciados' }),
    ).toBeVisible();
  });

  test('detalhe do projeto abre a partir do card do dashboard', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await expect(
      page.getByRole('heading', { level: 3, name: 'sample-node-app' }),
    ).toBeVisible();

    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();

    await expect(
      page.getByRole('heading', { level: 2, name: 'sample-node-app' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/sample-node-app-[a-f0-9]{8}$/);
  });

  test('não repete as detecções ao abrir um projeto Rails', async ({
    page,
  }) => {
    const projectRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') return;
      const pathname = new URL(request.url()).pathname;
      if (
        /\/api\/projects\/[^/]+\/(database|rails\/sidekiq|rails\/webpack)$/.test(
          pathname,
        )
      ) {
        projectRequests.push(pathname);
      }
    });

    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'sample-rails-app' }),
    ).toBeVisible();

    const railsRequests = projectRequests.filter((path) =>
      path.includes('/sample-rails-app-'),
    );
    expect(
      railsRequests.filter((path) => path.endsWith('/database')),
    ).toHaveLength(1);
    expect(
      railsRequests.filter((path) => path.endsWith('/rails/sidekiq')),
    ).toHaveLength(1);
    expect(
      railsRequests.filter((path) => path.endsWith('/rails/webpack')),
    ).toHaveLength(1);
  });

  test('rota desconhecida cai na página de não encontrado', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/rota-que-nao-existe');
    await expect(
      page.getByRole('heading', { level: 3, name: 'Página não encontrada' }),
    ).toBeVisible();
  });
});
