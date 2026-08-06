import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitBranchRenameError,
  GitBranchRenameService,
} from '../src/services/git-branch-rename-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function createRepository(): Promise<{
  root: string;
  repository: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-rename-'));
  const repository = path.join(root, 'repository');
  await git(root, 'init', '--initial-branch=main', repository);
  await git(repository, 'config', 'user.name', 'Dashboard Test');
  await git(repository, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(repository, 'README.md'), '# Teste\n');
  await git(repository, 'add', 'README.md');
  await git(repository, 'commit', '-m', 'initial commit');
  await git(repository, 'branch', 'feature/old');
  return { root, repository };
}

test('renomeia uma branch local com confirmação vinculada aos nomes', async () => {
  const { root, repository } = await createRepository();
  try {
    const service = new GitBranchRenameService();
    const confirmation = service.prepareConfirmation(
      'project-1',
      'feature/old',
      'feature/new',
    );
    const result = await service.renameLocalBranch(
      repository,
      'project-1',
      'feature/old',
      'feature/new',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/new');
    assert.equal(await git(repository, 'branch', '--list', 'feature/old'), '');
    assert.match(
      await git(repository, 'branch', '--list', 'feature/new'),
      /feature\/new/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('recusa reutilizar a confirmação com outro nome de destino', async () => {
  const { root, repository } = await createRepository();
  try {
    const service = new GitBranchRenameService();
    const confirmation = service.prepareConfirmation(
      'project-1',
      'feature/old',
      'feature/new',
    );

    await assert.rejects(
      () =>
        service.renameLocalBranch(
          repository,
          'project-1',
          'feature/old',
          'feature/other',
          confirmation.token,
        ),
      (error: unknown) => {
        assert.ok(error instanceof GitBranchRenameError);
        assert.equal(error.code, 'GIT_MUTATION_CONFIRMATION_REQUIRED');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('protege a branch principal contra renomeação', async () => {
  const { root } = await createRepository();
  try {
    const service = new GitBranchRenameService();
    assert.throws(
      () =>
        service.prepareConfirmation(
          'project-1',
          'main',
          'feature/main-renamed',
        ),
      (error: unknown) => {
        assert.ok(error instanceof GitBranchRenameError);
        assert.equal(error.code, 'GIT_BRANCH_PROTECTED');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('protege o nome principal como destino da renomeação', async () => {
  const { root } = await createRepository();
  try {
    const service = new GitBranchRenameService();
    assert.throws(
      () => service.prepareConfirmation('project-1', 'feature/old', 'master'),
      (error: unknown) => {
        assert.ok(error instanceof GitBranchRenameError);
        assert.equal(error.code, 'GIT_BRANCH_PROTECTED');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
