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
  const terminalCanvas = page.locator('.dashboard-terminal-canvas');
  await expect(terminalCanvas).toHaveCSS('min-width', '0px');
  await expect(terminalCanvas).toHaveCSS('box-sizing', 'border-box');

  const [canvasBox, terminalBox] = await Promise.all([
    terminalCanvas.boundingBox(),
    terminal.boundingBox(),
  ]);
  expect(canvasBox).not.toBeNull();
  expect(terminalBox).not.toBeNull();
  expect(terminalBox!.y + terminalBox!.height).toBeLessThanOrEqual(
    canvasBox!.y + canvasBox!.height + 1,
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
