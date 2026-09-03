import { expect, test, type Route } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

function projectIdFrom(route: Route): string {
  const pathname = new URL(route.request().url()).pathname;
  return decodeURIComponent(pathname.split('/')[3] ?? '');
}

test.describe('Jornadas críticas', () => {
  test('inicia e para o servidor do projeto', async ({ page }) => {
    let currentStatus: 'stopped' | 'running' = 'stopped';
    let startCalls = 0;
    let stopCalls = 0;

    const processPayload = (projectId: string) => ({
      id: 'e2e-project-server',
      projectId,
      kind: 'server',
      status: currentStatus,
      ...(currentStatus === 'running'
        ? {
            pid: 4321,
            port: 3000,
            url: 'http://localhost:3000',
            startedAt: new Date().toISOString(),
          }
        : {
            stoppedAt: new Date().toISOString(),
            exitCode: 0,
          }),
    });

    await page.route('**/api/projects/*/server-settings', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ settings: {}, environments: [] }),
        });
        return;
      }

      if (request.method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ settings: {}, environments: [] }),
        });
        return;
      }

      await route.continue();
    });

    await page.route('**/api/projects/*/process', async (route) => {
      const projectId = projectIdFrom(route);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          process: currentStatus === 'running' ? processPayload(projectId) : null,
        }),
      });
    });

    await page.route('**/api/projects/*/process/start', async (route) => {
      startCalls += 1;
      currentStatus = 'running';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ process: processPayload(projectIdFrom(route)) }),
      });
    });

    await page.route('**/api/projects/*/process/stop', async (route) => {
      stopCalls += 1;
      currentStatus = 'stopped';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ process: processPayload(projectIdFrom(route)) }),
      });
    });

    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();

    await expect(page.getByText('Pronto para iniciar')).toBeVisible();

    await page.getByRole('button', { name: 'Iniciar servidor' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Tudo funcionando' }),
    ).toBeVisible();
    await expect(page.getByText('Em execução', { exact: true })).toBeVisible();
    expect(startCalls).toBe(1);

    await page.getByRole('button', { name: 'Parar', exact: true }).click();
    await expect(page.getByText('Pronto para iniciar')).toBeVisible();
    expect(stopCalls).toBe(1);
  });

  test('recupera a carga do projeto pelo teclado após esgotar retries automáticos', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    const projectLink = page.getByRole('link', {
      name: 'Ver detalhes de sample-node-app',
    });
    const projectHref = await projectLink.getAttribute('href');
    if (!projectHref) {
      throw new Error('Link do projeto de fixture não foi encontrado.');
    }

    const projectPath = new URL(projectHref, 'http://localhost').pathname;
    let healthFailuresRemaining = 3;
    let healthAttempts = 0;

    await page.route('**/api/health', async (route) => {
      healthAttempts += 1;
      if (healthFailuresRemaining > 0) {
        healthFailuresRemaining -= 1;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'SERVICE_UNAVAILABLE',
            message: 'Falha temporária simulada pelo E2E.',
          }),
        });
        return;
      }

      await route.continue();
    });

    await gotoBootstrapped(page, projectPath);

    await expect(
      page.getByRole('heading', {
        level: 3,
        name: 'Não foi possível carregar o projeto',
      }),
    ).toBeVisible();
    expect(healthAttempts).toBe(3);

    const retryButton = page.getByRole('button', { name: 'Tentar novamente' });
    await retryButton.focus();
    await expect(retryButton).toBeFocused();
    await retryButton.press('Enter');

    await expect(
      page.getByRole('heading', { level: 2, name: 'sample-node-app' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Servidor', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    expect(healthAttempts).toBe(4);
  });
});
