import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitUndoError,
  GitUndoService,
} from '../src/services/git-undo-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout;
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-undo-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.name', 'Dashboard Test']);
  await git(root, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit inicial']);
  return root;
}

test('desfaz commit local com reset soft e mantém alterações staged', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const initialHead = (await git(root, ['rev-parse', 'HEAD'])).trim();
  await writeFile(path.join(root, 'README.md'), 'v2\n');
  await writeFile(path.join(root, 'novo.txt'), 'novo\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'altera arquivos']);

  const service = new GitUndoService();
  const confirmation = await service.prepareConfirmation(
    root,
    'p1',
    'commit',
    'main',
  );
  const result = await service.undoLastCommit(root, 'p1', confirmation.token);

  assert.equal(result.strategy, 'reset');
  assert.equal(result.undone.subject, 'altera arquivos');
  assert.equal((await git(root, ['rev-parse', 'HEAD'])).trim(), initialHead);
  const staged = await git(root, ['diff', '--cached', '--name-only']);
  assert.match(staged, /README\.md/);
  assert.match(staged, /novo\.txt/);
});

test('reverte commit já publicado sem reescrever histórico', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await writeFile(path.join(root, 'README.md'), 'publicado\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit publicado']);
  const publishedHead = (await git(root, ['rev-parse', 'HEAD'])).trim();
  await git(root, [
    'remote',
    'add',
    'origin',
    'https://example.invalid/projeto.git',
  ]);
  await git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  await git(root, ['branch', '--set-upstream-to=origin/main', 'main']);

  const service = new GitUndoService();
  const confirmation = await service.prepareConfirmation(
    root,
    'p1',
    'commit',
    'main',
  );
  const result = await service.undoLastCommit(root, 'p1', confirmation.token);

  assert.equal(result.strategy, 'revert');
  assert.equal(result.undone.hash, publishedHead);
  assert.ok(result.result);
  assert.notEqual(result.result.hash, publishedHead);
  assert.match(result.result.subject, /^Revert /);
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), 'v1\n');
  assert.equal(await git(root, ['status', '--porcelain']), '');
});

test('desfaz arquivo modificado mesmo quando está staged', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await writeFile(path.join(root, 'README.md'), 'alterado\n');
  await git(root, ['add', 'README.md']);

  const service = new GitUndoService();
  const confirmation = await service.prepareConfirmation(
    root,
    'p1',
    'file',
    'README.md',
  );
  const result = await service.undoFile(
    root,
    'p1',
    'README.md',
    confirmation.token,
  );

  assert.equal(result.path, 'README.md');
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), 'v1\n');
  assert.equal(await git(root, ['status', '--porcelain']), '');
});

test('desfazer arquivo não rastreado remove o arquivo', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const filePath = path.join(root, 'temporario.txt');
  await writeFile(filePath, 'temporário\n');

  const service = new GitUndoService();
  const confirmation = await service.prepareConfirmation(
    root,
    'p1',
    'file',
    'temporario.txt',
  );
  await service.undoFile(root, 'p1', 'temporario.txt', confirmation.token);

  await assert.rejects(() => access(filePath));
  assert.equal(await git(root, ['status', '--porcelain']), '');
});

test('confirmação inválida não altera o repositório', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await writeFile(path.join(root, 'README.md'), 'alterado\n');
  const service = new GitUndoService();

  await assert.rejects(
    () => service.undoFile(root, 'p1', 'README.md'),
    (error: unknown) =>
      error instanceof GitUndoError &&
      error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );

  assert.equal(
    await readFile(path.join(root, 'README.md'), 'utf8'),
    'alterado\n',
  );
});

test('bloqueia desfazer commit quando a branch está atrás do remoto', async (context) => {
  const root = await makeRepo();
  context.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, 'README.md'), 'v2\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit local']);
  const remoteHead = (await git(root, ['rev-parse', 'HEAD'])).trim();

  await git(root, ['update-ref', 'refs/remotes/origin/main', remoteHead]);
  await git(root, ['branch', '--set-upstream-to=origin/main', 'main']);
  await writeFile(path.join(root, 'remote.txt'), 'remoto\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'simula remoto à frente']);
  const aheadCommit = (await git(root, ['rev-parse', 'HEAD'])).trim();
  await git(root, ['update-ref', 'refs/remotes/origin/main', aheadCommit]);
  await git(root, ['reset', '--hard', remoteHead]);

  const service = new GitUndoService();
  const status = await service.getCommitStatus(root);
  assert.equal(status.available, false);
  assert.equal(status.reason, 'behind');

  const confirmation = await service.prepareConfirmation(
    root,
    'p1',
    'commit',
    'main',
  );
  await assert.rejects(
    () => service.undoLastCommit(root, 'p1', confirmation.token),
    (error: unknown) =>
      error instanceof GitUndoError && error.code === 'GIT_BRANCH_BEHIND',
  );
});

test('sem upstream reconhece origin da mesma branch como commit publicado', async (context) => {
  const root = await makeRepo();
  context.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, 'README.md'), 'publicado\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit publicado']);
  await git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);

  const service = new GitUndoService();
  const status = await service.getCommitStatus(root);
  assert.equal(status.available, true);
  assert.equal(status.strategy, 'revert');
  assert.equal(status.reference, 'origin/main');
});

test('preflight bloqueia o primeiro commit antes da confirmação destrutiva', async (context) => {
  const root = await makeRepo();
  context.after(() => rm(root, { recursive: true, force: true }));

  const status = await new GitUndoService().getCommitStatus(root);
  assert.equal(status.available, false);
  assert.equal(status.reason, 'first-commit');
});

test('restaura rename staged sem deixar deleção órfã no index', async (context) => {
  const root = await makeRepo();
  context.after(() => rm(root, { recursive: true, force: true }));

  await git(root, ['mv', 'README.md', 'README-renamed.md']);

  const service = new GitUndoService();
  const confirmation = await service.prepareConfirmation(
    root,
    'p1',
    'file',
    'README-renamed.md',
  );
  await service.undoFile(
    root,
    'p1',
    'README-renamed.md',
    confirmation.token,
  );

  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), 'v1\n');
  await assert.rejects(access(path.join(root, 'README-renamed.md')));
  assert.equal((await git(root, ['status', '--porcelain'])).trim(), '');
});

test('restaurar conflito usa a versão do HEAD e limpa o estado conflitante', async (context) => {
  const root = await makeRepo();
  context.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(path.join(root, 'README.md'), 'ours\n');
  await git(root, ['add', 'README.md']);
  await git(root, ['commit', '-q', '-m', 'ours']);
  const ours = (await git(root, ['rev-parse', 'HEAD'])).trim();

  await git(root, ['checkout', '-q', '-b', 'other', 'HEAD^']);
  await writeFile(path.join(root, 'README.md'), 'theirs\n');
  await git(root, ['add', 'README.md']);
  await git(root, ['commit', '-q', '-m', 'theirs']);
  await git(root, ['checkout', '-q', 'main']);
  await assert.rejects(() => git(root, ['merge', 'other']));

  const service = new GitUndoService();
  const confirmation = await service.prepareConfirmation(
    root,
    'p1',
    'file',
    'README.md',
  );
  await service.undoFile(root, 'p1', 'README.md', confirmation.token);

  assert.equal((await git(root, ['rev-parse', 'HEAD'])).trim(), ours);
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), 'ours\n');
  assert.equal((await git(root, ['status', '--porcelain'])).trim(), '');
});

