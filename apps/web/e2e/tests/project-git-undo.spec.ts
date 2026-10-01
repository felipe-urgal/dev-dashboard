import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { readRuntimeInfo } from '../fixtures/runtime-info';

const execFileAsync = promisify(execFile);

test.describe('Desfazer do projeto', () => {
  test('separa unstage, descarte e exclusão e desfaz commit local com reset soft', async ({
    page,
  }) => {
    const info = await readRuntimeInfo();
    const repository = path.join(info.workspaceDirectory, 'sample-node-app');

    await execFileAsync('git', ['checkout', '-q', 'main'], { cwd: repository });
    await execFileAsync('git', ['reset', '--hard', 'origin/main'], {
      cwd: repository,
    });
    await execFileAsync('git', ['clean', '-fd'], { cwd: repository });

    const packagePath = path.join(repository, 'package.json');
    const lockfilePath = path.join(repository, 'package-lock.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as Record<
      string,
      unknown
    >;
    packageJson.description = 'staged undo e2e';
    await writeFile(packagePath, JSON.stringify(packageJson, null, 2));
    await execFileAsync('git', ['add', 'package.json'], { cwd: repository });

    const lockfile = JSON.parse(
      await readFile(lockfilePath, 'utf8'),
    ) as Record<string, unknown>;
    lockfile.description = 'unstaged undo e2e';
    await writeFile(lockfilePath, JSON.stringify(lockfile, null, 2));
    await writeFile(
      path.join(repository, 'undo-untracked.txt'),
      'arquivo temporário\n',
    );

    await gotoBootstrapped(page, '/');
    await page
      .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
      .click();
    await page.getByRole('link', { name: 'Git' }).click();
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await page.getByRole('tab', { name: /Alterações locais/ }).click();

    const stagedRow = page.locator('.git-undo-files article', {
      has: page.getByText('package.json', { exact: true }),
    });
    await expect(
      stagedRow.getByRole('button', { name: 'Tirar do staged' }),
    ).toBeVisible();
    await stagedRow.getByRole('button', { name: 'Tirar do staged' }).click();
    await expect(
      page.getByText(/removido do staged sem perder conteúdo/),
    ).toBeVisible();

    const lockfileRow = page.locator('.git-undo-files article', {
      has: page.getByText('package-lock.json', { exact: true }),
    });
    await lockfileRow
      .getByRole('button', { name: 'Descartar alterações' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Descartar alterações' })
      .click();
    await expect(
      page.getByText(/Alterações não staged de "package-lock.json" descartadas/),
    ).toBeVisible();

    const untrackedRow = page.locator('.git-undo-files article', {
      has: page.getByText('undo-untracked.txt', { exact: true }),
    });
    await untrackedRow.getByRole('button', { name: 'Excluir arquivo' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Excluir arquivo' })
      .click();
    await expect(
      page.getByText(/Arquivo "undo-untracked.txt" excluído/),
    ).toBeVisible();

    await execFileAsync('git', ['reset', '--hard', 'origin/main'], {
      cwd: repository,
    });
    await writeFile(lockfilePath, JSON.stringify({ ...lockfile, description: 'commit local para undo' }, null, 2));
    await execFileAsync('git', ['add', 'package-lock.json'], { cwd: repository });
    await execFileAsync('git', ['commit', '-q', '-m', 'test: commit local para undo'], {
      cwd: repository,
    });

    await page.reload();
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByText('Commit local')).toBeVisible();
    await page.getByRole('button', { name: 'Desfazer commit' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Desfazer commit' })
      .click();
    await expect(page.getByText(/alterações ficaram staged/)).toBeVisible();

    const { stdout: stagedAfterUndo } = await execFileAsync(
      'git',
      ['diff', '--cached', '--name-only'],
      { cwd: repository, encoding: 'utf8' },
    );
    expect(stagedAfterUndo).toContain('package-lock.json');

    await execFileAsync('git', ['reset', '--hard', 'origin/main'], {
      cwd: repository,
    });
  });
});
