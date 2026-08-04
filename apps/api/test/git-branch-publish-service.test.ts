import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { GitBranchPublishService } from '../src/services/git-branch-publish-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function createRepository(): Promise<{
  root: string;
  local: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-publish-'));
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

  await git(local, 'switch', '--create', 'feature/publicar');
  await writeFile(path.join(local, 'feature.txt'), 'publicar\n');
  await git(local, 'add', 'feature.txt');
  await git(local, 'commit', '-m', 'feature commit');
  await git(local, 'switch', 'main');

  return { root, local };
}

test('publishes a local branch to origin without switching the current branch', async () => {
  const { root, local } = await createRepository();

  try {
    await writeFile(path.join(local, 'dirty.txt'), 'alteração local\n');
    const service = new GitBranchPublishService();
    const confirmation = service.preparePublishConfirmation(
      'project-1',
      'feature/publicar',
    );

    assert.equal(confirmation.operation, 'push');
    assert.equal(confirmation.target, 'feature/publicar');

    const result = await service.publishLocalBranch(
      local,
      'project-1',
      'feature/publicar',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/publicar');
    assert.equal(await git(local, 'branch', '--show-current'), 'main');
    assert.equal(
      await git(
        local,
        'for-each-ref',
        '--format=%(upstream:short)',
        'refs/heads/feature/publicar',
      ),
      'origin/feature/publicar',
    );
    assert.equal(
      await git(
        local,
        '--git-dir',
        path.join(root, 'origin.git'),
        'show-ref',
        '--verify',
        '--hash',
        'refs/heads/feature/publicar',
      ),
      await git(local, 'rev-parse', 'feature/publicar'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
