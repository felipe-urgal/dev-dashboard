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
  origin: string;
}> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-git-remote-delete-'),
  );
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

  await git(local, 'switch', '--create', 'feature/remove-me');
  await writeFile(path.join(local, 'feature.txt'), 'feature\n');
  await git(local, 'add', 'feature.txt');
  await git(local, 'commit', '-m', 'feature');
  await git(local, 'push', '--set-upstream', 'origin', 'feature/remove-me');
  await git(local, 'switch', 'main');

  return { root, local, origin };
}

test('removes a confirmed branch from origin without deleting the local branch', async () => {
  const { root, local, origin } = await createRepository();

  try {
    const service = new GitBranchService();
    const confirmation = service.prepareRemoteDeleteConfirmation(
      'project-1',
      'origin/feature/remove-me',
    );

    assert.equal(confirmation.operation, 'delete-remote-branch');
    assert.equal(confirmation.target, 'origin/feature/remove-me');

    const result = await service.deleteRemoteBranch(
      local,
      'project-1',
      'origin/feature/remove-me',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/remove-me');
    assert.equal(
      await git(
        local,
        'show-ref',
        '--verify',
        '--hash',
        'refs/heads/feature/remove-me',
      ),
      await git(local, 'rev-parse', 'feature/remove-me'),
    );
    await assert.rejects(() =>
      git(
        origin,
        'show-ref',
        '--verify',
        '--quiet',
        'refs/heads/feature/remove-me',
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('protects main from remote deletion', () => {
  const service = new GitBranchService();

  assert.throws(
    () => service.prepareRemoteDeleteConfirmation('project-1', 'origin/main'),
    (error: unknown) => {
      assert.ok(error instanceof GitBranchServiceError);
      assert.equal(error.code, 'GIT_BRANCH_INVALID');
      return true;
    },
  );
});

test('does not allow deleting branches from upstream', () => {
  const service = new GitBranchService();

  assert.throws(
    () =>
      service.prepareRemoteDeleteConfirmation(
        'project-1',
        'upstream/feature/remove-me',
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitBranchServiceError);
      assert.equal(error.code, 'GIT_BRANCH_INVALID');
      return true;
    },
  );
});
