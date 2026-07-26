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
