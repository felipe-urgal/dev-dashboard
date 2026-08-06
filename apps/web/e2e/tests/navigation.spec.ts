import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

test.describe('navegação principal', () => {
  test('painel de visão geral renderiza com o projeto de fixture', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Visão geral' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Projetos detectados' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 3, name: 'sample-node-app' }),
    ).toBeVisible();
  });

  test('favorita o projeto e preserva a preferência após recarregar', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');

    const favoriteButton = page.getByRole('button', {
      name: 'Adicionar sample-node-app aos favoritos',
    });
    await expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

    await favoriteButton.click();

    const unfavoriteButton = page.getByRole('button', {
      name: 'Remover sample-node-app dos favoritos',
    });
    await expect(unfavoriteButton).toHaveAttribute('aria-pressed', 'true');

    await page.reload();

    await expect(
      page.getByRole('button', {
        name: 'Remover sample-node-app dos favoritos',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('página global de processos renderiza', async ({ page }) => {
    await gotoBootstrapped(page, '/processes');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Processos gerenciados' }),
    ).toBeVisible();
  });

  test('painel de atividade renderiza', async ({ page }) => {
    await gotoBootstrapped(page, '/activity');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Painel de atividade' }),
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
      page.getByRole('heading', { level: 1, name: 'Detalhes do projeto' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/sample-node-app-[a-f0-9]{8}$/);
  });

  test('rota desconhecida cai na página de não encontrado', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/rota-que-nao-existe');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeVisible();
  });

  test('paleta global encontra e abre um projeto', async ({ page }) => {
    await gotoBootstrapped(page, '/processes');
    await page.keyboard.press('ControlOrMeta+KeyK');

    const search = page.getByRole('searchbox', {
      name: 'Buscar ou executar um comando',
    });
    await expect(search).toBeFocused();
    await search.fill('sample-node-app');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/projects\/sample-node-app-[a-f0-9]{8}$/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'sample-node-app' }),
    ).toBeVisible();
  });

  test('paleta inicia o servidor somente após confirmação explícita', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page.keyboard.press('ControlOrMeta+KeyK');
    const search = page.getByRole('searchbox', {
      name: 'Buscar ou executar um comando',
    });
    await search.fill('@sample-node-app');
    await page.keyboard.press('Tab');
    await expect(search).toHaveValue('@sample-node-app > ');
    await search.fill('@sample-node-app > iniciar server');
    await expect(
      page.getByRole('option', { name: /Iniciar servidor/ }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Confirmar', { exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Servidor iniciado com sucesso.' }),
    ).toBeVisible();
  });
});
