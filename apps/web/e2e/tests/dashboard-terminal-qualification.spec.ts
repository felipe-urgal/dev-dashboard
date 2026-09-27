import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';

async function terminalText(
  page: import('@playwright/test').Page,
): Promise<string> {
  return page
    .locator('.dashboard-terminal-canvas .xterm-rows')
    .textContent()
    .then((value) => value ?? '');
}

test('qualifica o Terminal embutido com PTY real', async ({ page }) => {
  test.setTimeout(45_000);

  await gotoBootstrapped(page, '/');

  await page.getByRole('button', { name: 'Terminal', exact: true }).click();

  const terminal = page.locator('.dashboard-terminal-canvas .xterm');
  await expect(terminal).toBeVisible();
  await expect.poll(() => terminalText(page)).toContain('Dev Dashboard');
  await expect.poll(() => terminalText(page)).toContain('sample-node-app');

  const reconnectCredentials = await page.evaluate(() =>
    sessionStorage.getItem('dev-dashboard-terminal-session'),
  );
  expect(reconnectCredentials).toBeTruthy();

  // Alternar Web -> Terminal preserva o mesmo componente/sessão.
  await page.getByRole('button', { name: 'Web', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Ver detalhes de sample-node-app' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(terminal).toBeVisible();
  await expect.poll(() => terminalText(page)).toContain('sample-node-app');

  // Resize exercita FitAddon -> mensagem resize -> PTY sem quebrar a UI.
  await page.setViewportSize({ width: 900, height: 650 });
  await expect(terminal).toBeVisible();
  await expect(page.locator('.dashboard-terminal-canvas')).toHaveCSS(
    'min-width',
    '0px',
  );

  // Reload força perda do WebSocket e reconexão usando a sessão persistida.
  await page.reload();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(terminal).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem('dev-dashboard-terminal-session'),
      ),
    )
    .toBe(reconnectCredentials);
  await expect(page.getByText('Terminal desconectado')).toHaveCount(0);
  await expect(page.getByText('Abrir nova sessão')).toHaveCount(0);
});
