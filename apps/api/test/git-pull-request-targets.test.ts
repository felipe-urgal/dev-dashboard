import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { GitPullRequestService } from '../src/services/git-pull-request-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function makeForkFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-pr-target-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.name', 'Dashboard Test']);
  await git(root, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit inicial']);
  const mainHead = await git(root, ['rev-parse', 'HEAD']);

  await git(root, ['remote', 'add', 'origin', 'git@github.com:felipe-urgal/dev-dashboard.git']);
  await git(root, ['remote', 'add', 'upstream', 'git@github.com:empresa/dev-dashboard.git']);
  await git(root, ['update-ref', 'refs/remotes/origin/main', mainHead]);
  await git(root, ['update-ref', 'refs/remotes/upstream/main', mainHead]);

  await git(root, ['switch', '-q', '-c', 'feature/pull-request']);
  await writeFile(path.join(root, 'feature.txt'), 'feature\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'feat: fluxo de pull request']);
  await git(root, ['update-ref', 'refs/remotes/origin/feature/pull-request', 'HEAD']);
  await git(root, ['branch', '--set-upstream-to=origin/feature/pull-request', 'feature/pull-request']);

  return root;
}

test('compõe Pull Request do fork origin para upstream com título e descrição', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  const service = new GitPullRequestService();
  const result = await service.composeUrl(root, {
    targetRemote: 'upstream',
    baseBranch: 'main',
    title: 'feat: fluxo de PR',
    description: '## Resumo\n\nAbre a Pull Request pelo painel.',
  });

  assert.equal(result.provider, 'github');
  assert.equal(result.branch, 'feature/pull-request');
  assert.equal(result.defaultBranch, 'main');

  const url = new URL(result.url);
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.pathname, '/empresa/dev-dashboard/compare/main...felipe-urgal%3Afeature%2Fpull-request');
  assert.equal(url.searchParams.get('quick_pull'), '1');
  assert.equal(url.searchParams.get('title'), 'feat: fluxo de PR');
  assert.equal(
    url.searchParams.get('body'),
    '## Resumo\n\nAbre a Pull Request pelo painel.',
  );
});

test('compõe Pull Request para origin usando branch base escolhida', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  const mainHead = await git(root, ['rev-parse', 'refs/remotes/origin/main']);
  await git(root, ['update-ref', 'refs/remotes/origin/develop', mainHead]);

  const service = new GitPullRequestService();
  const result = await service.composeUrl(root, {
    targetRemote: 'origin',
    baseBranch: 'develop',
    title: 'PR para develop',
    description: '',
  });

  const url = new URL(result.url);
  assert.equal(url.pathname, '/felipe-urgal/dev-dashboard/compare/develop...feature%2Fpull-request');
  assert.equal(url.searchParams.get('quick_pull'), '1');
  assert.equal(url.searchParams.get('title'), 'PR para develop');
  assert.equal(url.searchParams.get('body'), null);
});
