import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { GitBranchPullRequestCleanupService } from '../src/services/git-branch-pull-request-cleanup-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<void> {
  await exec('git', args, { cwd });
}

test('fecha PRs abertos no origin e no upstream para a branch removida', async (context) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-branch-pr-cleanup-'),
  );
  context.after(() => rm(root, { recursive: true, force: true }));

  await git(root, 'init', '-q', '-b', 'main');
  await git(
    root,
    'remote',
    'add',
    'origin',
    'git@github.com:fork-owner/repo.git',
  );
  await git(
    root,
    'remote',
    'add',
    'upstream',
    'git@github.com:main-owner/repo.git',
  );

  const calls: Array<readonly string[]> = [];
  const service = new GitBranchPullRequestCleanupService(async (_cwd, args) => {
    calls.push(args);
    if (args[1] === 'list' && args.includes('fork-owner/repo')) {
      return JSON.stringify([{ number: 10 }]);
    }
    if (args[1] === 'list' && args.includes('main-owner/repo')) {
      return JSON.stringify([{ number: 20 }]);
    }
    return '';
  });

  await service.closeOpenForBranch(root, 'feature/remove-me');

  assert.deepEqual(calls, [
    [
      'pr',
      'list',
      '--repo',
      'fork-owner/repo',
      '--state',
      'open',
      '--head',
      'fork-owner:feature/remove-me',
      '--json',
      'number',
      '--limit',
      '100',
    ],
    ['pr', 'close', '10', '--repo', 'fork-owner/repo'],
    [
      'pr',
      'list',
      '--repo',
      'main-owner/repo',
      '--state',
      'open',
      '--head',
      'fork-owner:feature/remove-me',
      '--json',
      'number',
      '--limit',
      '100',
    ],
    ['pr', 'close', '20', '--repo', 'main-owner/repo'],
  ]);
});

test('ignora remotos que não são GitHub', async (context) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-branch-pr-cleanup-'),
  );
  context.after(() => rm(root, { recursive: true, force: true }));

  await git(root, 'init', '-q', '-b', 'main');
  await git(root, 'remote', 'add', 'origin', 'git@gitlab.com:owner/repo.git');

  let called = false;
  const service = new GitBranchPullRequestCleanupService(async () => {
    called = true;
    return '[]';
  });

  await service.closeOpenForBranch(root, 'feature/remove-me');
  assert.equal(called, false);
});

test('falha fechado quando a consulta de Pull Requests retorna payload inválido', async (context) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-branch-pr-cleanup-'),
  );
  context.after(() => rm(root, { recursive: true, force: true }));

  await git(root, 'init', '-q', '-b', 'main');
  await git(
    root,
    'remote',
    'add',
    'origin',
    'git@github.com:fork-owner/repo.git',
  );

  const service = new GitBranchPullRequestCleanupService(async () => '{}');

  await assert.rejects(
    () => service.closeOpenForBranch(root, 'feature/remove-me'),
    /Não foi possível verificar ou fechar a Pull Request aberta/,
  );
});
