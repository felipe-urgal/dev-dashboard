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
  origin: string;
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

  return { root, local, origin };
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


test('reenviar commit alterado usa lease explícito e atualiza o origin', async () => {
  const { root, local } = await createRepository();

  try {
    const service = new GitBranchPublishService();
    await git(local, 'switch', 'feature/publicar');
    const publishConfirmation = service.preparePublishConfirmation(
      'project-1',
      'feature/publicar',
    );
    await service.publishLocalBranch(
      local,
      'project-1',
      'feature/publicar',
      publishConfirmation.token,
    );

    await writeFile(path.join(local, 'feature.txt'), 'commit alterado\n');
    await git(local, 'add', 'feature.txt');
    await git(local, 'commit', '--amend', '-m', 'feature corrigida');

    const confirmation = await service.prepareForcePushWithLeaseConfirmation(
      local,
      'project-1',
      'feature/publicar',
    );
    assert.match(confirmation.target, /^feature\/publicar::[0-9a-f]{40}$/);

    const result = await service.forcePushWithLease(
      local,
      'project-1',
      'feature/publicar',
      confirmation.token,
    );
    assert.equal(result.branch, 'feature/publicar');
    assert.equal(
      await git(
        local,
        '--git-dir',
        path.join(root, 'origin.git'),
        'rev-parse',
        'refs/heads/feature/publicar',
      ),
      await git(local, 'rev-parse', 'feature/publicar'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('lease recusa sobrescrever commits publicados depois da confirmação', async () => {
  const { root, local, origin } = await createRepository();
  const other = path.join(root, 'other');

  try {
    const service = new GitBranchPublishService();
    await git(local, 'switch', 'feature/publicar');
    const publishConfirmation = service.preparePublishConfirmation(
      'project-1',
      'feature/publicar',
    );
    await service.publishLocalBranch(
      local,
      'project-1',
      'feature/publicar',
      publishConfirmation.token,
    );
    await writeFile(path.join(local, 'feature.txt'), 'commit local alterado\n');
    await git(local, 'add', 'feature.txt');
    await git(local, 'commit', '--amend', '-m', 'feature local corrigida');

    const confirmation = await service.prepareForcePushWithLeaseConfirmation(
      local,
      'project-1',
      'feature/publicar',
    );

    await git(root, 'clone', origin, other);
    await git(other, 'config', 'user.name', 'Outro Dev');
    await git(other, 'config', 'user.email', 'outro@example.test');
    await git(other, 'switch', 'feature/publicar');
    await writeFile(path.join(other, 'other.txt'), 'novo commit remoto\n');
    await git(other, 'add', 'other.txt');
    await git(other, 'commit', '-m', 'novo commit remoto');
    await git(other, 'push', 'origin', 'feature/publicar');
    const remoteAfterOtherPush = await git(
      other,
      'rev-parse',
      'feature/publicar',
    );

    await assert.rejects(
      () => service.forcePushWithLease(
        local,
        'project-1',
        'feature/publicar',
        confirmation.token,
      ),
      (error: unknown) => Boolean(
        error
        && typeof error === 'object'
        && 'code' in error
        && error.code === 'GIT_FORCE_WITH_LEASE_REJECTED'
      ),
    );
    assert.equal(
      await git(
        local,
        '--git-dir',
        origin,
        'rev-parse',
        'refs/heads/feature/publicar',
      ),
      remoteAfterOtherPush,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
