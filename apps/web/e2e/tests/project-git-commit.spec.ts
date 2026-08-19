import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { readRuntimeInfo } from '../fixtures/runtime-info';

test.describe('Commit do projeto', () => {
  test('vazio sem alterações, cria commit com sucesso e reseta ao trocar de projeto', async ({
    page,
  }) => {
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await page.getByRole('link', { name: 'Git' }).click();
    await page.getByRole('button', { name: 'Commit', exact: true }).click();

    // Vazio: a fixture chega com a árvore de trabalho limpa (task 107 deixa
    // a branch "main" sem pendências ao final do seu próprio teste).
    const submitButton = page.locator('.git-commit-submit');
    await expect(submitButton).toBeDisabled();

    // Suja uma alteração rastreada diretamente no disco da fixture (não há
    // editor de arquivo neste fluxo) e recarrega para o painel reconsultar
    // o status real do repositório.
    const info = await readRuntimeInfo();
    const lockfilePath = path.join(
      info.workspaceDirectory,
      'sample-node-app',
      'package-lock.json',
    );
    const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8')) as Record<
      string,
      unknown
    >;
    lockfile.description = 'alteração do e2e de commit';
    await writeFile(lockfilePath, JSON.stringify(lockfile, null, 2));
    await page.reload();
    await page.getByRole('button', { name: 'Commit', exact: true }).click();

    await expect(page.getByText('1 alteração rastreada')).toBeVisible();

    // Sucesso: cria o commit com a alteração rastreada.
    await page
      .getByLabel('Mensagem do commit')
      .fill('chore: ajusta lockfile via e2e');
    await submitButton.click();
    const confirmDialog = page.getByRole('dialog');
    await expect(
      confirmDialog.getByRole('button', { name: 'Criar commit' }),
    ).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Criar commit' }).click();
    await expect(
      page.getByText(/^Commit ".+" criado: chore: ajusta lockfile via e2e$/),
    ).toBeVisible();
    await expect(page.getByText('0 alterações rastreadas')).toBeVisible();

    // Troca de projeto: sample-rails-app continua sem Git.
    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-rails-app' })
      .click();
    await page.getByRole('link', { name: 'Git' }).click();
    await expect(
      page.getByText('Este projeto não é um repositório Git.'),
    ).toBeVisible();
  });
});
