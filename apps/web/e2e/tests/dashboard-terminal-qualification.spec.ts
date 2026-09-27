import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test, type Page } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { readRuntimeInfo } from '../fixtures/runtime-info';

const execFileAsync = promisify(execFile);

async function terminalText(page: Page): Promise<string> {
  return page
    .locator('.dashboard-terminal-canvas .xterm-rows')
    .textContent()
    .then((value) => value ?? '');
}

async function waitForTerminalText(
  page: Page,
  expected: string,
): Promise<void> {
  await expect.poll(() => terminalText(page)).toContain(expected);
}

async function sendLine(page: Page, value = ''): Promise<void> {
  const input = page.locator(
    '.dashboard-terminal-canvas .xterm-helper-textarea',
  );
  await input.focus();
  if (value) await page.keyboard.type(value);
  await page.keyboard.press('Enter');
}

async function chooseProject(page: Page, projectName: string): Promise<void> {
  await expect
    .poll(async () => {
      const text = await terminalText(page);
      return (
        text.match(new RegExp(`(\\d+)\\) [^\\n]*${projectName}`))?.[1] ?? ''
      );
    })
    .not.toBe('');

  const text = await terminalText(page);
  const choice = text.match(new RegExp(`(\\d+)\\) [^\\n]*${projectName}`))?.[1];
  if (!choice) throw new Error(`Projeto ${projectName} não apareceu no TUI.`);
  await waitForTerminalText(page, 'Escolha o número:');
  await sendLine(page, choice);
}

test('qualifica dev-tools real dentro da interface Web', async ({ page }) => {
  test.setTimeout(60_000);
  const runtime = await readRuntimeInfo();

  await gotoBootstrapped(page, '/');
  const projectLink = page.getByRole('link', {
    name: 'Ver detalhes de sample-node-app',
  });
  const href = await projectLink.getAttribute('href');
  expect(href).toBeTruthy();
  const projectId = decodeURIComponent(
    new URL(href!, 'http://localhost').pathname.split('/').at(-1) ?? '',
  );

  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('.dashboard-terminal-canvas .xterm')).toBeVisible();
  await waitForTerminalText(page, 'Dev Dashboard');
  await waitForTerminalText(page, 'sample-node-app');

  await chooseProject(page, 'sample-node-app');
  await waitForTerminalText(page, 'Ações para sample-node-app');
  await waitForTerminalText(page, 'Escolha:');

  // Read-only real: Git -> Histórico.
  await sendLine(page, '1');
  await waitForTerminalText(page, 'Selecione uma ação Git.');
  await waitForTerminalText(page, 'Escolha:');
  await sendLine(page, '7');
  await waitForTerminalText(page, 'Branch: main');
  await waitForTerminalText(page, 'Pressione Enter para continuar');
  await sendLine(page);

  // Mutation real com confirmação: Git -> Branches -> Criar branch local.
  await waitForTerminalText(page, 'Selecione uma ação Git.');
  await waitForTerminalText(page, 'Escolha:');
  await sendLine(page, '1');
  await waitForTerminalText(page, 'Branches');
  await waitForTerminalText(page, 'Escolha:');
  await sendLine(page, '2');
  await waitForTerminalText(page, 'Prefixo');
  await waitForTerminalText(page, 'Escolha:');
  await sendLine(page, '1');
  await waitForTerminalText(page, 'Nome da branch');
  await sendLine(page, 'e2e-terminal');
  await waitForTerminalText(page, "Criar 'feature/e2e-terminal'");
  await sendLine(page, 's');
  await waitForTerminalText(page, 'Branch criada: feature/e2e-terminal');

  // Reload real: o browser perde o WebSocket, mas o PTY fica recuperável.
  await page.reload();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('.dashboard-terminal-canvas .xterm')).toBeVisible();
  await sendLine(page);
  await waitForTerminalText(page, 'Branches');
  await waitForTerminalText(page, 'Escolha:');

  const projectDirectory = `${runtime.workspaceDirectory}/sample-node-app`;
  const { stdout } = await execFileAsync('git', [
    '-C',
    projectDirectory,
    'branch',
    '--show-current',
  ]);
  expect(stdout.trim()).toBe('feature/e2e-terminal');

  await expect
    .poll(async () => {
      return page.evaluate(async (id) => {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(id)}/activity?limit=50`,
        );
        return response.ok ? JSON.stringify(await response.json()) : '';
      }, projectId);
    })
    .toContain('git.create-branch');

  // Preserva a sessão ao alternar Web -> Terminal.
  await page.getByRole('button', { name: 'Web', exact: true }).click();
  await expect(projectLink).toBeVisible();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('.dashboard-terminal-canvas .xterm')).toBeVisible();
  await waitForTerminalText(page, 'Branches');

  // Resize da viewport mantém a TUI utilizável.
  await page.setViewportSize({ width: 900, height: 650 });
  await expect(page.locator('.dashboard-terminal-canvas .xterm')).toBeVisible();

  // Sai dos submenus e encerra/reabre o dev-tools no mesmo modo Terminal.
  await sendLine(page, '8');
  await waitForTerminalText(page, 'Selecione uma ação Git.');
  await waitForTerminalText(page, 'Escolha:');
  await sendLine(page, '8');
  await waitForTerminalText(page, 'Ações para sample-node-app');
  await waitForTerminalText(page, 'Escolha:');
  await sendLine(page, '6');
  await waitForTerminalText(page, 'sample-node-app');

  const menuText = await terminalText(page);
  expect(menuText).not.toContain('Banco');
  expect(menuText).not.toContain('Bundler');
  expect(menuText).not.toContain('Rake Tasks');
  expect(menuText).not.toContain('Scripts');
  expect(menuText).not.toContain('Ferramentas');

  // Escolhe Sair no menu principal e confirma; o frontend expõe estado exited.
  const current = await terminalText(page);
  const exitChoice = current.match(/(\d+)\) Sair/)?.[1];
  if (!exitChoice)
    throw new Error('Opção Sair não encontrada no menu principal.');
  await sendLine(page, exitChoice);
  await waitForTerminalText(page, 'Deseja sair?');
  await sendLine(page, 's');
  await expect(page.getByText('Sessão encerrada')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir nova sessão' }).click();
  await expect(page.locator('.dashboard-terminal-canvas .xterm')).toBeVisible();
  await waitForTerminalText(page, 'Dev Dashboard');
});
