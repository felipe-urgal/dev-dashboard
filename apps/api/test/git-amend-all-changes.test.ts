import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { GitMutationError, GitService } from '../src/services/git-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout;
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-amend-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.name', 'Dashboard Test']);
  await git(root, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit inicial']);
  return root;
}

test('amend adiciona todas as alterações atuais antes de substituir o último commit', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  await writeFile(path.join(root, 'README.md'), 'v2\n');
  await writeFile(path.join(root, 'novo-arquivo.txt'), 'novo\n');

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'amend', 'main');
  const result = await service.amend(
    root,
    'p1',
    'commit alterado',
    confirmation.token,
  );

  assert.equal(result.subject, 'commit alterado');
  assert.equal(await git(root, ['show', 'HEAD:README.md']), 'v2\n');
  assert.equal(await git(root, ['show', 'HEAD:novo-arquivo.txt']), 'novo\n');
  assert.equal(await git(root, ['status', '--porcelain']), '');
});

test('amend não faz stage quando a confirmação é inválida', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  await writeFile(path.join(root, 'README.md'), 'v2\n');
  await writeFile(path.join(root, 'novo-arquivo.txt'), 'novo\n');

  const service = new GitService();
  await assert.rejects(
    () => service.amend(root, 'p1', 'commit alterado'),
    (error: unknown) =>
      error instanceof GitMutationError
      && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );

  const staged = await git(root, ['diff', '--cached', '--name-only']);
  assert.equal(staged, '');
  const status = await git(root, ['status', '--porcelain']);
  assert.match(status, /README\.md/);
  assert.match(status, /novo-arquivo\.txt/);
});
