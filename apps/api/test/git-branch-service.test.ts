import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitBranchService,
  GitBranchServiceError,
} from '../src/services/git-branch-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function createRepository(): Promise<{
  root: string;
  local: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-track-'));
  const local = path.join(root, 'local');
  const origin = path.join(root, 'origin.git');

  await git(root, 'init', '--bare', '--initial-branch=main', origin);
  await git(root, 'init', '--initial-branch=main', local);
  await git(local, 'config', 'user.name', 'Dashboard Test');
  await git(local, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(local, 'README.md'), '# Teste\n');
  await git(local, 'add', 'README.md');
  await git(local, 'commit', '-m', 'initial commit');
  await git(local, 'remote', 'add', 'origin', origin);
  await git(local, 'push', '--set-upstream', 'origin', 'main');

  await git(local, 'switch', '--create', 'release/2.0');
  await writeFile(path.join(local, 'release.txt'), '2.0\n');
  await git(local, 'add', 'release.txt');
  await git(local, 'commit', '-m', 'release 2.0');
  await git(local, 'push', '--set-upstream', 'origin', 'release/2.0');
  await git(local, 'switch', 'main');
  await git(local, 'branch', '--delete', '--force', 'release/2.0');
  await git(local, 'fetch', 'origin');

  return { root, local };
}

test('creates a local branch tracking the selected remote branch', async () => {
  const { root, local } = await createRepository();

  try {
    const service = new GitBranchService();
    const confirmation = service.prepareTrackingConfirmation(
      'project-1',
      'origin/release/2.0',
    );

    assert.equal(confirmation.operation, 'track-branch');
    assert.equal(confirmation.target, 'origin/release/2.0');

    const result = await service.trackRemoteBranch(
      local,
      'project-1',
      'origin/release/2.0',
      confirmation.token,
    );

    assert.equal(result.branch, 'release/2.0');
    assert.equal(await git(local, 'branch', '--show-current'), 'release/2.0');
    assert.equal(
      await git(local, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'),
      'origin/release/2.0',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('requires a clean working tree before tracking a remote branch', async () => {
  const { root, local } = await createRepository();

  try {
    await writeFile(path.join(local, 'dirty.txt'), 'não commitado\n');
    const service = new GitBranchService();
    const confirmation = service.prepareTrackingConfirmation(
      'project-1',
      'origin/release/2.0',
    );

    await assert.rejects(
      () => service.trackRemoteBranch(
        local,
        'project-1',
        'origin/release/2.0',
        confirmation.token,
      ),
      (error: unknown) => {
        assert.ok(error instanceof GitBranchServiceError);
        assert.equal(error.code, 'GIT_WORKING_TREE_DIRTY');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects tracking without the matching confirmation', async () => {
  const { root, local } = await createRepository();

  try {
    const service = new GitBranchService();
    await assert.rejects(
      () => service.trackRemoteBranch(
        local,
        'project-1',
        'origin/release/2.0',
        'invalid-token',
      ),
      (error: unknown) => {
        assert.ok(error instanceof GitBranchServiceError);
        assert.equal(error.code, 'GIT_MUTATION_CONFIRMATION_REQUIRED');
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
