import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { gotoBootstrapped } from '../fixtures/navigate';
import { readRuntimeInfo } from '../fixtures/runtime-info';

const execFileAsync = promisify(execFile);

test.describe('Pull Request do projeto', () => {
  test('mostra origem/base reais e degrada com segurança para remote não suportado', async ({
    page,
  }) => {
    const info = await readRuntimeInfo();
    const repository = path.join(info.workspaceDirectory, 'sample-node-app');

    await execFileAsync('git', ['checkout', '-q', 'main'], { cwd: repository });
    await execFileAsync('git', ['reset', '--hard', 'origin/main'], {
      cwd: repository,
    });
    await execFileAsync('git', ['clean', '-fd'], { cwd: repository });
    await execFileAsync('git', ['switch', '-q', '-c', 'feature/pr-e2e'], {
      cwd: repository,
    });
    await writeFile(path.join(repository, 'pr-e2e.txt'), 'pull request e2e\n');
    await execFileAsync('git', ['add', 'pr-e2e.txt'], { cwd: repository });
    await execFileAsync(
      'git',
      ['commit', '-q', '-m', 'test: pull request e2e'],
      { cwd: repository },
    );
    await execFileAsync(
      'git',
      ['push', '-q', '-u', 'origin', 'feature/pr-e2e'],
      { cwd: repository },
    );

    try {
      await gotoBootstrapped(page, '/');
      await page
        .getByRole('link', { name: 'Ver detalhes de sample-node-app' })
        .click();
      await page.getByRole('button', { name: 'Git' }).click();
      await page.getByRole('link', { name: 'Pull Request' }).click();

      await expect(
        page.getByText('Não foi possível verificar automaticamente'),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Continuar para criação' })
        .click();

      await expect(page.getByText('origin/feature/pr-e2e')).toBeVisible();
      await expect(page.getByText('origin/main')).toBeVisible();
      await expect(page.locator('.git-pr-primary')).toHaveCount(0);
      await expect(page.locator('.git-pr-draft')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Abrir comparação' }),
      ).toBeVisible();
    } finally {
      await execFileAsync('git', ['checkout', '-q', 'main'], {
        cwd: repository,
      });
      await execFileAsync('git', ['branch', '-D', 'feature/pr-e2e'], {
        cwd: repository,
      });
      await execFileAsync(
        'git',
        ['push', '-q', 'origin', '--delete', 'feature/pr-e2e'],
        {
          cwd: repository,
        },
      );
    }
  });
});
