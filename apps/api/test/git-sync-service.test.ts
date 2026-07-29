import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitSyncError,
  GitSyncService,
} from '../src/services/git-sync-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

interface RepositoryFixture {
  root: string;
  local: string;
  cleanup: () => Promise<void>;
}

async function createFixture(): Promise<RepositoryFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-sync-'));
  const remote = path.join(root, 'upstream.git');
  const local = path.join(root, 'local');
  const source = path.join(root, 'source');

  await git(root, 'init', '--bare', '--initial-branch=main', remote);
  await git(root, 'init', '--initial-branch=main', local);
  await git(local, 'config', 'user.name', 'Dashboard Test');
  await git(local, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(local, 'README.md'), '# Projeto\n');
  await git(local, 'add', 'README.md');
  await git(local, 'commit', '-m', 'initial');
  await git(local, 'remote', 'add', 'upstream', remote);
  await git(local, 'push', '--set-upstream', 'upstream', 'main');
  await git(local, 'switch', '--create', 'feature/sync');

  await git(root, 'clone', remote, source);
  await git(source, 'config', 'user.name', 'Upstream Test');
  await git(source, 'config', 'user.email', 'upstream@example.test');
  await writeFile(path.join(source, 'upstream.txt'), 'nova versão\n');
  await git(source, 'add', 'upstream.txt');
  await git(source, 'commit', '-m', 'feat: atualiza upstream');
  await git(source, 'push', 'origin', 'main');
  await git(local, 'fetch', 'upstream');

  return {
    root,
    local,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test('compara e integra uma referência remota com fast-forward', async () => {
  const fixture = await createFixture();
  const service = new GitSyncService();

  try {
    assert.deepEqual(
      await service.compare(fixture.local, 'upstream/main'),
      {
        reference: 'upstream/main',
        ahead: 0,
        behind: 1,
      },
    );

    const confirmation = service.prepareConfirmation(
      'project-1',
      'upstream/main',
      'ff-only',
    );
    const result = await service.integrate(
      fixture.local,
      'project-1',
      'upstream/main',
      'ff-only',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/sync');
    assert.equal(result.reference, 'upstream/main');
    assert.equal(result.strategy, 'ff-only');
    assert.equal(result.changed, true);
    assert.equal(await git(fixture.local, 'rev-parse', 'HEAD'), result.currentHead);
    assert.equal(
      await git(fixture.local, 'rev-list', '--count', 'HEAD..upstream/main'),
      '0',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('exige confirmação antes de integrar', async () => {
  const fixture = await createFixture();
  const service = new GitSyncService();

  try {
    await assert.rejects(
      service.integrate(
        fixture.local,
        'project-1',
        'upstream/main',
        'ff-only',
      ),
      (error: unknown) =>
        error instanceof GitSyncError
        && error.code === 'GIT_SYNC_CONFIRMATION_REQUIRED',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('bloqueia integração quando o working tree está alterado', async () => {
  const fixture = await createFixture();
  const service = new GitSyncService();

  try {
    await writeFile(path.join(fixture.local, 'local.txt'), 'não commitado\n');
    const confirmation = service.prepareConfirmation(
      'project-1',
      'upstream/main',
      'rebase',
    );

    await assert.rejects(
      service.integrate(
        fixture.local,
        'project-1',
        'upstream/main',
        'rebase',
        confirmation.token,
      ),
      (error: unknown) =>
        error instanceof GitSyncError
        && error.code === 'GIT_WORKING_TREE_DIRTY',
    );
  } finally {
    await fixture.cleanup();
  }
});
