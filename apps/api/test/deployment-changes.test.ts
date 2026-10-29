import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DeploymentChangesService } from '../src/deployment/changes.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=T', '-c', 'user.email=t@example.test', ...args],
    { cwd, encoding: 'utf8' },
  ).trim();
}

async function commit(
  cwd: string,
  file: string,
  message: string,
): Promise<string> {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), message);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

test('lista os commits pendentes, os arquivos e as migrations desde a produção', async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'dd-changes-'));
  try {
    git(repo, 'init', '-b', 'main');
    const production = await commit(repo, 'a.txt', 'feat: base');
    await commit(repo, 'db/migrate/001_add_users.rb', 'feat: cria users');
    const head = await commit(repo, 'src/c.txt', 'fix: ajusta c');

    const service = new DeploymentChangesService();
    const changes = await service.pending(repo, 'main', production);

    assert.equal(changes.state, 'available');
    assert.equal(changes.total, 2);
    assert.equal(changes.commits[0]?.subject, 'fix: ajusta c');
    assert.equal(changes.commits[0]?.hash, head);
    assert.equal(changes.files, 2);
    assert.equal(changes.migrations, 1);

    const upToDate = await service.pending(repo, 'main', head);
    assert.equal(upToDate.state, 'available');
    assert.equal(upToDate.total, 0);

    const unknown = await service.pending(repo, 'main', 'a'.repeat(40));
    assert.equal(unknown.state, 'unknown');
    assert.equal(unknown.reason, 'revision-not-found');

    const missingBranch = await service.pending(repo, 'inexistente', head);
    assert.equal(missingBranch.reason, 'branch-not-found');
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test('commits resolve só revisões válidas e ignora o que não existe no clone', async () => {
  const repo = await mkdtemp(path.join(tmpdir(), 'dd-changes-'));
  try {
    git(repo, 'init', '-b', 'main');
    const first = await commit(repo, 'a.txt', 'feat: primeiro');

    const result = await new DeploymentChangesService().commits(repo, [
      first,
      'b'.repeat(40),
      '--evil',
      'não-é-sha',
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0]?.subject, 'feat: primeiro');
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
