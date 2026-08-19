import { mkdir } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { readRuntimeInfo } from '../fixtures/runtime-info';

test.describe('estabilidade do shell e dos terminais', () => {
  test('abre o modal de workspace e cadastra um diretório novo', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page.getByRole('button', { name: 'Adicionar workspace' }).click();

    const dialog = page.getByRole('dialog', { name: 'Adicionar workspace' });
    await expect(dialog).toBeVisible();

    const info = await readRuntimeInfo();
    const workspacePath = `${info.workspaceDirectory}/workspace-extra`;
    await mkdir(workspacePath, { recursive: true });

    await dialog.getByPlaceholder('Projetos pessoais').fill('Workspace extra');
    await dialog.getByPlaceholder('/home/usuario/projetos').fill(workspacePath);
    await dialog.getByRole('button', { name: 'Adicionar workspace' }).click();

    await expect(
      page.getByText('Workspace "Workspace extra" cadastrado.'),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Trocar workspace ativo' }),
    ).toHaveValue(/.+/);
  });

  test('inicia uma sessão de terminal com scrollback visual limitado', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await page.getByRole('link', { name: 'Terminal', exact: true }).click();
    await page.getByRole('button', { name: 'Iniciar sessão' }).click();

    const terminal = page.locator('.terminal-window');
    await expect(terminal).toBeVisible();
    await expect(terminal.locator('.xterm')).toBeVisible();
    await expect(terminal.locator('.xterm-viewport')).toHaveCSS(
      'overflow-y',
      'auto',
    );
  });
});
