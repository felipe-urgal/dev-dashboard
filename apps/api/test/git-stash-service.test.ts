import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { GitStashService } from '../src/services/git-stash-service.js';

const execFileAsync = promisify(execFile);

async function run(directory: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd: directory,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

async function createRepository(): Promise<{ directory: string; branch: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-stash-'));
  await run(directory, ['init']);
  await run(directory, ['config', 'user.name', 'Dashboard Test']);
  await run(directory, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(directory, 'README.md'), '# Projeto\n', 'utf8');
  await run(directory, ['add', 'README.md']);
  await run(directory, ['commit', '-m', 'initial commit']);
  return {
    directory,
    branch: await run(directory, ['branch', '--show-current']),
  };
}

test('cria, inspeciona, aplica, restaura e exclui stashes específicos', async () => {
  const repository = await createRepository();
  const service = new GitStashService();
  const projectId = 'project-stash-test';

  try {
    await writeFile(path.join(repository.directory, 'README.md'), '# Projeto alterado\n', 'utf8');
    await writeFile(path.join(repository.directory, 'rascunho.txt'), 'temporário\n', 'utf8');

    const createConfirmation = service.prepareConfirmation(
      projectId,
      'create',
      repository.branch,
    );
    const created = await service.create(
      repository.directory,
      projectId,
      {
        message: 'trabalho parcial',
        includeUntracked: true,
        keepIndex: false,
      },
      createConfirmation.token,
    );

    assert.equal(created.stash.reference, 'stash@{0}');
    assert.equal(created.stash.message, 'trabalho parcial');
    assert.equal(created.stash.branch, repository.branch);
    assert.equal(created.stash.includesUntracked, true);
    assert.equal(await run(repository.directory, ['status', '--porcelain']), '');

    const detail = await service.inspect(repository.directory, created.stash.reference);
    assert.ok(detail.files.some((file) => file.path === 'README.md'));
    assert.ok(detail.files.some((file) => file.path === 'rascunho.txt'));
    assert.match(detail.patch, /Projeto alterado/);

    const applyConfirmation = service.prepareConfirmation(
      projectId,
      'apply',
      created.stash.reference,
    );
    const applied = await service.apply(
      repository.directory,
      projectId,
      created.stash.reference,
      applyConfirmation.token,
    );
    assert.equal(applied.applied, true);
    assert.equal(applied.removed, false);
    assert.equal((await service.list(repository.directory)).length, 1);
    assert.match(await readFile(path.join(repository.directory, 'README.md'), 'utf8'), /alterado/);
    assert.equal(await readFile(path.join(repository.directory, 'rascunho.txt'), 'utf8'), 'temporário\n');

    await run(repository.directory, ['reset', '--hard', 'HEAD']);
    await run(repository.directory, ['clean', '-fd']);

    const popConfirmation = service.prepareConfirmation(
      projectId,
      'pop',
      created.stash.reference,
    );
    const popped = await service.pop(
      repository.directory,
      projectId,
      created.stash.reference,
      popConfirmation.token,
    );
    assert.equal(popped.applied, true);
    assert.equal(popped.removed, true);
    assert.equal((await service.list(repository.directory)).length, 0);

    await run(repository.directory, ['reset', '--hard', 'HEAD']);
    await run(repository.directory, ['clean', '-fd']);
    await writeFile(path.join(repository.directory, 'README.md'), '# Outra alteração\n', 'utf8');

    const secondConfirmation = service.prepareConfirmation(
      projectId,
      'create',
      repository.branch,
    );
    const second = await service.create(
      repository.directory,
      projectId,
      {
        message: 'descartar depois',
        includeUntracked: false,
        keepIndex: false,
      },
      secondConfirmation.token,
    );
    const dropConfirmation = service.prepareConfirmation(
      projectId,
      'drop',
      second.stash.reference,
    );
    const dropped = await service.drop(
      repository.directory,
      projectId,
      second.stash.reference,
      dropConfirmation.token,
    );
    assert.equal(dropped.removed, true);
    assert.equal((await service.list(repository.directory)).length, 0);
  } finally {
    await rm(repository.directory, { recursive: true, force: true });
  }
});
