import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { GitMutationError, GitService } from '../src/services/git-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-mut-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'init']);
  return root;
}

async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  return stdout.trim();
}

async function configureIdentity(cwd: string): Promise<void> {
  await git(cwd, ['config', 'user.email', 'dev@example.com']);
  await git(cwd, ['config', 'user.name', 'Dev']);
}

async function makeOriginAndClone(): Promise<{ root: string; origin: string; clone: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-sync-'));
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  await execFileAsync('git', ['clone', '-q', origin, clone]);
  await configureIdentity(clone);
  await writeFile(path.join(clone, 'README.md'), 'v1\n');
  await git(clone, ['add', '.']);
  await git(clone, ['commit', '-q', '-m', 'init']);
  await git(clone, ['push', '-q', '-u', 'origin', 'main']);
  return { root, origin, clone };
}

test('createBranch cria e troca para o novo branch após confirmação', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'create-branch', 'feature/x');
  const result = await service.createBranch(root, 'p1', 'feature/x', confirmation.token);
  assert.equal(result.branch, 'feature/x');
  assert.equal(await currentBranch(root), 'feature/x');
});

test('createBranch sem confirmação é recusado', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  await assert.rejects(
    () => service.createBranch(root, 'p1', 'feature/y'),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );
});

test('createBranch com nome inválido falha antes de tocar no repositório', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  await assert.rejects(
    () => service.createBranch(root, 'p1', '/leading-slash', 'x'.repeat(64)),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_BRANCH_INVALID',
  );
  await assert.rejects(
    () => service.createBranch(root, 'p1', 'double//slash', 'x'.repeat(64)),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_BRANCH_INVALID',
  );
});

test('createBranch em branch já existente falha com GIT_BRANCH_EXISTS', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const service2 = service;
  const first = service.prepareMutationConfirmation('p1', 'create-branch', 'feature/x');
  await service.createBranch(root, 'p1', 'feature/x', first.token);
  await git(root, ['switch', 'main']);
  const second = service2.prepareMutationConfirmation('p1', 'create-branch', 'feature/x');
  await assert.rejects(
    () => service2.createBranch(root, 'p1', 'feature/x', second.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_BRANCH_EXISTS',
  );
});

test('createBranch com arquivo não rastreado presente falha com GIT_WORKING_TREE_DIRTY', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'novo.txt'), 'ainda não rastreado\n');
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'create-branch', 'feature/w');
  await assert.rejects(
    () => service.createBranch(root, 'p1', 'feature/w', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_WORKING_TREE_DIRTY',
  );
});

test('switchBranch em árvore suja falha com GIT_WORKING_TREE_DIRTY', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const created = service.prepareMutationConfirmation('p1', 'create-branch', 'feature/z');
  await service.createBranch(root, 'p1', 'feature/z', created.token);
  await git(root, ['switch', 'main']);
  await writeFile(path.join(root, 'README.md'), 'dirty\n');
  const confirmation = service.prepareMutationConfirmation('p1', 'switch-branch', 'feature/z');
  await assert.rejects(
    () => service.switchBranch(root, 'p1', 'feature/z', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_WORKING_TREE_DIRTY',
  );
});

test('switchBranch devolve o impacto entre o SHA anterior e o novo', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const created = service.prepareMutationConfirmation('p1', 'create-branch', 'feature/lockfile');
  await service.createBranch(root, 'p1', 'feature/lockfile', created.token);
  await writeFile(path.join(root, 'package-lock.json'), '{}\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'chore: adiciona lockfile']);
  await git(root, ['switch', 'main']);

  const confirmation = service.prepareMutationConfirmation('p1', 'switch-branch', 'feature/lockfile');
  const result = await service.switchBranch(root, 'p1', 'feature/lockfile', confirmation.token);
  assert.equal(result.branch, 'feature/lockfile');
  assert.deepEqual(result.impact.changedPaths, ['package-lock.json']);
  assert.equal(result.impact.actions.length, 1);
  assert.equal(result.impact.actions[0]?.category, 'dependencies');
});

test('switchBranch para branch inexistente falha com GIT_BRANCH_NOT_FOUND', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'switch-branch', 'no-such-branch');
  await assert.rejects(
    () => service.switchBranch(root, 'p1', 'no-such-branch', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_BRANCH_NOT_FOUND',
  );
});

test('push envia commits novos para o origin após confirmação', async (context) => {
  const { root, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(clone, 'README.md'), 'v2\n');
  await git(clone, ['commit', '-q', '-am', 'v2']);
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'push', 'main');
  const result = await service.push(clone, 'p1', confirmation.token);
  assert.equal(result.branch, 'main');
  const { stdout } = await execFileAsync('git', ['rev-parse', 'origin/main'], { cwd: clone });
  const { stdout: head } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: clone });
  assert.equal(stdout.trim(), head.trim());
});

test('push sem confirmação é recusado', async (context) => {
  const { root, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  await assert.rejects(
    () => service.push(clone, 'p1'),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );
});

test('push em repositório sem remoto "origin" falha com GIT_REMOTE_NOT_CONFIGURED', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'push', 'main');
  await assert.rejects(
    () => service.push(root, 'p1', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_REMOTE_NOT_CONFIGURED',
  );
});

test('push rejeitado pelo remoto quando o clone está desatualizado falha com GIT_PUSH_REJECTED', async (context) => {
  const { root, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const staleClone = path.join(root, 'stale-clone');
  await execFileAsync('git', ['clone', '-q', path.join(root, 'origin.git'), staleClone]);
  await configureIdentity(staleClone);
  await writeFile(path.join(clone, 'README.md'), 'v2\n');
  await git(clone, ['commit', '-q', '-am', 'v2']);
  await git(clone, ['push', '-q']);
  await writeFile(path.join(staleClone, 'other.txt'), 'stale\n');
  await git(staleClone, ['add', '.']);
  await git(staleClone, ['commit', '-q', '-m', 'stale change']);
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'push', 'main');
  await assert.rejects(
    () => service.push(staleClone, 'p1', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_PUSH_REJECTED',
  );
});

test('push em HEAD destacado falha com GIT_DETACHED_HEAD', async (context) => {
  const { root, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await git(clone, ['checkout', '-q', '--detach', 'main']);
  const service = new GitService();
  await assert.rejects(
    () => service.push(clone, 'p1', 'x'.repeat(64)),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_DETACHED_HEAD',
  );
});

test('pull avança em fast-forward após confirmação', async (context) => {
  const { root, origin, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const secondClone = path.join(root, 'second-clone');
  await execFileAsync('git', ['clone', '-q', origin, secondClone]);
  await configureIdentity(secondClone);
  await writeFile(path.join(clone, 'README.md'), 'v2\n');
  await git(clone, ['commit', '-q', '-am', 'v2']);
  await git(clone, ['push', '-q']);

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'pull', 'main');
  const result = await service.pull(secondClone, 'p1', confirmation.token);
  assert.equal(result.branch, 'main');
  const content = await execFileAsync('git', ['show', 'HEAD:README.md'], { cwd: secondClone });
  assert.equal(content.stdout, 'v2\n');
  assert.deepEqual(result.impact.changedPaths, ['README.md']);
  assert.deepEqual(result.impact.actions, []);
});

test('pull sem upstream falha com GIT_NO_UPSTREAM', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'pull', 'main');
  await assert.rejects(
    () => service.pull(root, 'p1', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_NO_UPSTREAM',
  );
});

test('pull com árvore de trabalho suja falha com GIT_WORKING_TREE_DIRTY', async (context) => {
  const { root, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(clone, 'novo.txt'), 'não rastreado\n');
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'pull', 'main');
  await assert.rejects(
    () => service.pull(clone, 'p1', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_WORKING_TREE_DIRTY',
  );
});

test('pull com histórico divergente falha com GIT_PULL_DIVERGED', async (context) => {
  const { root, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const secondClone = path.join(root, 'second-clone');
  await execFileAsync('git', ['clone', '-q', path.join(root, 'origin.git'), secondClone]);
  await configureIdentity(secondClone);

  await writeFile(path.join(clone, 'README.md'), 'do origin\n');
  await git(clone, ['commit', '-q', '-am', 'origin segue']);
  await git(clone, ['push', '-q']);

  await writeFile(path.join(secondClone, 'local-only.txt'), 'local\n');
  await git(secondClone, ['add', '.']);
  await git(secondClone, ['commit', '-q', '-m', 'commit local divergente']);

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'pull', 'main');
  await assert.rejects(
    () => service.pull(secondClone, 'p1', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_PULL_DIVERGED',
  );
});

test('pull em HEAD destacado falha com GIT_DETACHED_HEAD', async (context) => {
  const { root, clone } = await makeOriginAndClone();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await git(clone, ['checkout', '-q', '--detach', 'main']);
  const service = new GitService();
  await assert.rejects(
    () => service.pull(clone, 'p1', 'x'.repeat(64)),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_DETACHED_HEAD',
  );
});

test('commit registra as alterações staged após confirmação', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'README.md'), 'v2\n');
  await git(root, ['add', '.']);
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'commit', 'main');
  const result = await service.commit(root, 'p1', 'atualiza README', false, confirmation.token);
  assert.equal(result.subject, 'atualiza README');
  const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%s'], { cwd: root });
  assert.equal(stdout.trim(), 'atualiza README');
});

test('commit com includeAllChanges adiciona modificações rastreadas automaticamente', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'README.md'), 'v2\n');
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'commit', 'main');
  const result = await service.commit(root, 'p1', 'inclui tudo', true, confirmation.token);
  assert.equal(result.subject, 'inclui tudo');
});

test('amend substitui a mensagem do último commit sem exigir alterações', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const previousHead = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'amend', 'main');
  const result = await service.amend(
    root,
    'p1',
    'mensagem corrigida',
    confirmation.token,
  );
  assert.equal(result.subject, 'mensagem corrigida');
  assert.notEqual(result.hash, previousHead.stdout.trim());
  const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: root });
  assert.equal(status.stdout, '');
});

test('amend sem confirmação é recusado', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  await assert.rejects(
    () => service.amend(root, 'p1', 'mensagem corrigida'),
    (error: unknown) =>
      error instanceof GitMutationError
      && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );
});

test('commit sem nada staged falha com GIT_NOTHING_TO_COMMIT', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'commit', 'main');
  await assert.rejects(
    () => service.commit(root, 'p1', 'nada para commitar', false, confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_NOTHING_TO_COMMIT',
  );
});

test('commit com mensagem vazia falha com GIT_COMMIT_MESSAGE_INVALID antes de tocar no repositório', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  await assert.rejects(
    () => service.commit(root, 'p1', '   ', false, 'x'.repeat(64)),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_COMMIT_MESSAGE_INVALID',
  );
});

test('commit sem confirmação é recusado', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'README.md'), 'v2\n');
  await git(root, ['add', '.']);
  const service = new GitService();
  await assert.rejects(
    () => service.commit(root, 'p1', 'sem confirmação', false),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );
});

test('save prepara todas as alterações (incluindo não rastreadas) e aplica o prefixo do branch', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await git(root, ['switch', '-q', '-c', 'feature/nova-tela']);
  await writeFile(path.join(root, 'README.md'), 'v2\n');
  await writeFile(path.join(root, 'novo.txt'), 'ainda não rastreado\n');
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'save', 'feature/nova-tela');
  const result = await service.save(root, 'p1', 'adiciona tela', confirmation.token);
  assert.equal(result.subject, 'feat: adiciona tela');
  const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: root });
  assert.equal(status.stdout.trim(), '', 'a árvore de trabalho deveria ficar limpa após o save');
  const files = await execFileAsync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: root });
  assert.match(files.stdout, /novo\.txt/);
});

test('save em branch sem tipo conhecido commita sem prefixo', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'README.md'), 'v2\n');
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'save', 'main');
  const result = await service.save(root, 'p1', 'ajusta docs', confirmation.token);
  assert.equal(result.subject, 'ajusta docs');
});

test('save sem nenhuma alteração falha com GIT_NOTHING_TO_COMMIT', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'save', 'main');
  await assert.rejects(
    () => service.save(root, 'p1', 'nada para salvar', confirmation.token),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_NOTHING_TO_COMMIT',
  );
});

test('save sem confirmação é recusado antes de preparar qualquer arquivo', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'novo.txt'), 'não rastreado\n');
  const service = new GitService();
  await assert.rejects(
    () => service.save(root, 'p1', 'sem confirmação'),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );
  const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: root });
  assert.match(status.stdout, /\?\? novo\.txt/, 'o arquivo não deveria ter sido staged');
});

test('save com mensagem vazia falha com GIT_COMMIT_MESSAGE_INVALID antes de tocar no repositório', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  await assert.rejects(
    () => service.save(root, 'p1', '   ', 'x'.repeat(64)),
    (error: unknown) => error instanceof GitMutationError && error.code === 'GIT_COMMIT_MESSAGE_INVALID',
  );
});
