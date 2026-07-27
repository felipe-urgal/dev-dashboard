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

async function makeOriginAndClone(): Promise<{ root: string; origin: string; clone: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-sync-'));
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  await execFileAsync('git', ['clone', '-q', origin, clone]);
  await git(clone, ['config', 'user.email', 'dev@example.com']);
  await git(clone, ['config', 'user.name', 'Dev']);
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
  await writeFile(path.join(clone, 'README.md'), 'v2\n');
  await git(clone, ['commit', '-q', '-am', 'v2']);
  await git(clone, ['push', '-q']);

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation('p1', 'pull', 'main');
  const result = await service.pull(secondClone, 'p1', confirmation.token);
  assert.equal(result.branch, 'main');
  const content = await execFileAsync('git', ['show', 'HEAD:README.md'], { cwd: secondClone });
  assert.equal(content.stdout, 'v2\n');
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
