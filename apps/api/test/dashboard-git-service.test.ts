import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { DashboardGitService } from '../src/services/dashboard-git-service.js';
import { GitMutationError } from '../src/services/git-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd });
  return result.stdout.trim();
}

async function createRepository(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  await git(directory, 'init', '-b', 'main');
  await git(directory, 'config', 'user.name', 'Dashboard Test');
  await git(directory, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(directory, 'tracked.txt'), 'initial\n');
  await git(directory, 'add', 'tracked.txt');
  await git(directory, 'commit', '-m', 'initial commit');
  return directory;
}

test('cria branch preservando alterações locais não commitadas', async () => {
  const directory = await createRepository('dashboard-dirty-branch-');
  const service = new DashboardGitService();

  try {
    await writeFile(path.join(directory, 'tracked.txt'), 'changed locally\n');
    const confirmation = service.prepareMutationConfirmation(
      'project-1',
      'create-branch',
      'feature/editor-scroll',
    );

    const result = await service.createBranch(
      directory,
      'project-1',
      'feature/editor-scroll',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/editor-scroll');
    assert.equal(
      await git(directory, 'branch', '--show-current'),
      'feature/editor-scroll',
    );
    assert.equal(
      await readFile(path.join(directory, 'tracked.txt'), 'utf8'),
      'changed locally\n',
    );
    assert.match(await git(directory, 'status', '--porcelain'), /tracked\.txt/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('confirma commit sem depender de uma segunda leitura da branch', async () => {
  const directory = await createRepository('dashboard-commit-confirmation-');
  const service = new DashboardGitService();

  try {
    const confirmation = service.prepareMutationConfirmation(
      'project-1',
      'commit',
      'main',
    );

    await git(directory, 'switch', '--create', 'feature/after-confirmation');
    await writeFile(path.join(directory, 'tracked.txt'), 'committed change\n');

    const result = await service.commit(
      directory,
      'project-1',
      'ajusta confirmação',
      true,
      confirmation.token,
    );

    assert.equal(result.subject, 'ajusta confirmação');
    assert.equal(
      await git(directory, 'branch', '--show-current'),
      'feature/after-confirmation',
    );

    await writeFile(path.join(directory, 'tracked.txt'), 'another change\n');
    await assert.rejects(
      service.commit(
        directory,
        'project-1',
        'não reutiliza token',
        true,
        confirmation.token,
      ),
      (error: unknown) =>
        error instanceof GitMutationError
        && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
