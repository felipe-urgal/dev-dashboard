import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  GitMutationError,
  GitService,
} from '../src/services/git-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

async function createRepository(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-commit-semantics-'),
  );
  await git(directory, 'init', '-q', '-b', 'main');
  await git(directory, 'config', 'user.name', 'Dashboard Test');
  await git(directory, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(directory, 'README.md'), 'original\n');
  await writeFile(path.join(directory, 'tracked.txt'), 'original\n');
  await git(directory, 'add', '.');
  await git(directory, 'commit', '-q', '-m', 'commit original');
  return directory;
}

test('commit -a inclui rastreados e staged, mas não adiciona untracked', async (context) => {
  const directory = await createRepository();
  context.after(() => rm(directory, { recursive: true, force: true }));

  await writeFile(path.join(directory, 'README.md'), 'modificado\n');
  await writeFile(path.join(directory, 'staged-new.txt'), 'staged\n');
  await git(directory, 'add', 'staged-new.txt');
  await writeFile(path.join(directory, 'untracked.txt'), 'fora\n');

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation(
    'project-1',
    'commit',
    'main',
  );
  await service.commit(
    directory,
    'project-1',
    'commit correto',
    true,
    confirmation.token,
  );

  assert.equal(await git(directory, 'show', 'HEAD:README.md'), 'modificado');
  assert.equal(await git(directory, 'show', 'HEAD:staged-new.txt'), 'staged');
  assert.equal(
    await git(directory, 'ls-tree', '--name-only', 'HEAD', '--', 'untracked.txt'),
    '',
  );
  assert.match(await git(directory, 'status', '--porcelain'), /\?\? untracked\.txt/);
});

test('amend inclui somente staged e preserva mudanças unstaged', async (context) => {
  const directory = await createRepository();
  context.after(() => rm(directory, { recursive: true, force: true }));

  await writeFile(path.join(directory, 'README.md'), 'continua unstaged\n');
  await writeFile(path.join(directory, 'tracked.txt'), 'entra no amend\n');
  await git(directory, 'add', 'tracked.txt');
  await writeFile(path.join(directory, 'untracked.txt'), 'fora\n');

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation(
    'project-1',
    'amend',
    'main',
  );
  await service.amend(
    directory,
    'project-1',
    'commit original',
    confirmation.token,
  );

  assert.equal(await git(directory, 'show', 'HEAD:README.md'), 'original');
  assert.equal(
    await git(directory, 'show', 'HEAD:tracked.txt'),
    'entra no amend',
  );
  const status = await git(directory, 'status', '--porcelain');
  assert.match(status, /README\.md/);
  assert.match(status, /\?\? untracked\.txt/);
});

test('amend recusa reescrever commit sem staged nem mudança de mensagem', async (context) => {
  const directory = await createRepository();
  context.after(() => rm(directory, { recursive: true, force: true }));

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation(
    'project-1',
    'amend',
    'main',
  );

  await assert.rejects(
    () =>
      service.amend(
        directory,
        'project-1',
        'commit original',
        confirmation.token,
      ),
    (error: unknown) =>
      error instanceof GitMutationError &&
      error.code === 'GIT_NOTHING_TO_COMMIT',
  );
});

test('amend permite alterar somente a mensagem', async (context) => {
  const directory = await createRepository();
  context.after(() => rm(directory, { recursive: true, force: true }));

  const before = await git(directory, 'rev-parse', 'HEAD');
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation(
    'project-1',
    'amend',
    'main',
  );
  const result = await service.amend(
    directory,
    'project-1',
    'mensagem alterada',
    confirmation.token,
  );

  assert.equal(result.subject, 'mensagem alterada');
  assert.notEqual(result.hash, before);
  assert.equal(await git(directory, 'status', '--porcelain'), '');
});
