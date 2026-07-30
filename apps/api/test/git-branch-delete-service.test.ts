import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitBranchDeleteError,
  GitBranchDeleteService,
} from '../src/services/git-branch-delete-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function createRepository(): Promise<{ root: string; repository: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-delete-'));
  const repository = path.join(root, 'repository');
  await git(root, 'init', '--initial-branch=main', repository);
  await git(repository, 'config', 'user.name', 'Dashboard Test');
  await git(repository, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(repository, 'README.md'), '# Teste\n');
  await git(repository, 'add', 'README.md');
  await git(repository, 'commit', '-m', 'initial commit');
  return { root, repository };
}

async function createCommittedBranch(repository: string, branch: string): Promise<void> {
  await git(repository, 'switch', '--create', branch);
  const fileName = `${branch.replaceAll('/', '-')}.txt`;
  await writeFile(path.join(repository, fileName), `${branch}\n`);
  await git(repository, 'add', fileName);
  await git(repository, 'commit', '-m', `feat: ${branch}`);
}

test('removes a local branch after it has been integrated', async () => {
  const { root, repository } = await createRepository();
  try {
    await createCommittedBranch(repository, 'feature/merged');
    await git(repository, 'switch', 'main');
    await git(repository, 'merge', '--no-ff', 'feature/merged', '-m', 'merge feature');

    const service = new GitBranchDeleteService();
    const confirmation = service.prepareConfirmation('project-1', 'feature/merged');
    const result = await service.deleteLocalBranch(
      repository,
      'project-1',
      'feature/merged',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/merged');
    assert.equal(await git(repository, 'branch', '--list', 'feature/merged'), '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects deleting the currently selected branch', async () => {
  const { root, repository } = await createRepository();
  try {
    await createCommittedBranch(repository, 'feature/current');
    const service = new GitBranchDeleteService();
    const confirmation = service.prepareConfirmation('project-1', 'feature/current');

    await assert.rejects(
      () => service.deleteLocalBranch(
        repository,
        'project-1',
        'feature/current',
        confirmation.token,
      ),
      (error: unknown) => {
        assert.ok(error instanceof GitBranchDeleteError);
        assert.equal(error.code, 'GIT_BRANCH_CURRENT');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('protects main even when another branch is selected', async () => {
  const { root, repository } = await createRepository();
  try {
    await git(repository, 'switch', '--create', 'feature/work');
    const service = new GitBranchDeleteService();
    const confirmation = service.prepareConfirmation('project-1', 'main');

    await assert.rejects(
      () => service.deleteLocalBranch(
        repository,
        'project-1',
        'main',
        confirmation.token,
      ),
      (error: unknown) => {
        assert.ok(error instanceof GitBranchDeleteError);
        assert.equal(error.code, 'GIT_BRANCH_PROTECTED');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('remove uma branch mesmo quando existem commits não integrados', async () => {
  const { root, repository } = await createRepository();
  try {
    await createCommittedBranch(repository, 'feature/unmerged');
    await git(repository, 'switch', 'main');
    const service = new GitBranchDeleteService();
    const confirmation = service.prepareConfirmation('project-1', 'feature/unmerged');

    const result = await service.deleteLocalBranch(
      repository,
      'project-1',
      'feature/unmerged',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/unmerged');
    assert.equal(
      await git(repository, 'branch', '--list', 'feature/unmerged'),
      '',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
