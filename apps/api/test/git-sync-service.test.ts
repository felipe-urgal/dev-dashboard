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
  origin: string;
  source: string;
  cleanup: () => Promise<void>;
}

async function createFixture(): Promise<RepositoryFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-sync-'));
  const upstream = path.join(root, 'upstream.git');
  const origin = path.join(root, 'origin.git');
  const local = path.join(root, 'local');
  const source = path.join(root, 'source');

  await git(root, 'init', '--bare', '--initial-branch=main', upstream);
  await git(root, 'init', '--bare', '--initial-branch=main', origin);
  await git(root, 'init', '--initial-branch=main', local);
  await git(local, 'config', 'user.name', 'Dashboard Test');
  await git(local, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(local, 'README.md'), '# Projeto\n');
  await git(local, 'add', 'README.md');
  await git(local, 'commit', '-m', 'initial');
  await git(local, 'remote', 'add', 'upstream', upstream);
  await git(local, 'remote', 'add', 'origin', origin);
  await git(local, 'push', '--set-upstream', 'upstream', 'main');
  await git(local, 'push', '--set-upstream', 'origin', 'main');
  await git(local, 'switch', '--create', 'feature/sync');

  await git(root, 'clone', upstream, source);
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
    origin,
    source,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test('compara e integra uma referência remota com fast-forward', async () => {
  const fixture = await createFixture();
  const service = new GitSyncService();

  try {
    assert.deepEqual(await service.compare(fixture.local, 'upstream/main'), {
      reference: 'upstream/main',
      ahead: 0,
      behind: 1,
    });

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
    assert.equal(
      await git(fixture.local, 'rev-parse', 'HEAD'),
      result.currentHead,
    );
    assert.equal(
      await git(fixture.local, 'rev-list', '--count', 'HEAD..upstream/main'),
      '0',
    );
    assert.equal(result.impact.previousSha, result.previousHead);
    assert.equal(result.impact.currentSha, result.currentHead);
  } finally {
    await fixture.cleanup();
  }
});

test('exige confirmação antes de integrar', async () => {
  const fixture = await createFixture();
  const service = new GitSyncService();

  try {
    await assert.rejects(
      service.integrate(fixture.local, 'project-1', 'upstream/main', 'ff-only'),
      (error: unknown) =>
        error instanceof GitSyncError &&
        error.code === 'GIT_SYNC_CONFIRMATION_REQUIRED',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('sincroniza a main a partir de upstream/main e publica em origin/main', async () => {
  const fixture = await createFixture();
  const service = new GitSyncService();

  try {
    await writeFile(
      path.join(fixture.source, 'upstream-2.txt'),
      'outra versão\n',
    );
    await git(fixture.source, 'add', 'upstream-2.txt');
    await git(fixture.source, 'commit', '-m', 'feat: nova atualização');
    await git(fixture.source, 'push', 'origin', 'main');

    const confirmation = await service.prepareMainConfirmation(
      fixture.local,
      'project-1',
    );
    const result = await service.synchronizeMain(
      fixture.local,
      'project-1',
      confirmation.token,
    );

    assert.equal(confirmation.reference, 'upstream/main');
    assert.equal(result.branch, 'main');
    assert.equal(result.reference, 'upstream/main');
    assert.equal(result.strategy, 'merge');
    assert.equal(result.changed, true);
    assert.equal(await git(fixture.local, 'branch', '--show-current'), 'main');
    assert.equal(
      await git(fixture.local, 'rev-parse', 'main'),
      await git(fixture.local, 'rev-parse', 'upstream/main'),
    );
    assert.equal(
      await git(fixture.origin, 'rev-parse', 'main'),
      result.currentHead,
    );
    assert.equal(result.impact.previousSha, result.previousHead);
    assert.equal(result.impact.currentSha, result.currentHead);
  } finally {
    await fixture.cleanup();
  }
});

test('sincroniza a main usando origin/main quando upstream não está configurado', async () => {
  const fixture = await createFixture();
  const service = new GitSyncService();

  try {
    await git(fixture.local, 'remote', 'remove', 'upstream');
    await git(fixture.source, 'remote', 'add', 'dashboard-origin', fixture.origin);
    await writeFile(path.join(fixture.source, 'origin-only.txt'), 'origin\n');
    await git(fixture.source, 'add', 'origin-only.txt');
    await git(fixture.source, 'commit', '-m', 'feat: atualiza origin');
    await git(fixture.source, 'push', 'dashboard-origin', 'main');

    const confirmation = await service.prepareMainConfirmation(
      fixture.local,
      'project-origin-only',
    );
    const result = await service.synchronizeMain(
      fixture.local,
      'project-origin-only',
      confirmation.token,
    );

    assert.equal(confirmation.reference, 'origin/main');
    assert.equal(result.reference, 'origin/main');
    assert.equal(result.changed, true);
    assert.equal(await git(fixture.local, 'branch', '--show-current'), 'main');
    assert.equal(
      await git(fixture.local, 'rev-parse', 'main'),
      await git(fixture.origin, 'rev-parse', 'main'),
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
        error instanceof GitSyncError &&
        error.code === 'GIT_WORKING_TREE_DIRTY',
    );
  } finally {
    await fixture.cleanup();
  }
});
