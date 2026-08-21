import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  countSquashableBranchCommits,
  GitBranchSquashService,
} from '../src/services/git-branch-squash-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function createRepository(): Promise<{ root: string; repo: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-squash-'));
  const repo = path.join(root, 'repo');

  await git(root, 'init', '--initial-branch=main', repo);
  await git(repo, 'config', 'user.name', 'Dashboard Test');
  await git(repo, 'config', 'user.email', 'dashboard@example.test');
  await writeFile(path.join(repo, 'README.md'), '# Teste\n');
  await git(repo, 'add', 'README.md');
  await git(repo, 'commit', '-m', 'initial commit');

  await git(repo, 'switch', '--create', 'feature/squash');
  for (let index = 1; index <= 3; index += 1) {
    await writeFile(path.join(repo, 'feature.txt'), `versão ${index}\n`);
    await git(repo, 'add', 'feature.txt');
    await git(repo, 'commit', '-m', `feature ${index}`);
  }

  return { root, repo };
}

test('condensa commits exclusivos da branch atual em um único commit', async () => {
  const { root, repo } = await createRepository();

  try {
    assert.equal(await countSquashableBranchCommits(repo, 'feature/squash'), 3);
    const originalTree = await git(repo, 'rev-parse', 'HEAD^{tree}');
    const service = new GitBranchSquashService();
    const confirmation = await service.prepareConfirmation(
      repo,
      'project-1',
      'feature/squash',
    );

    assert.equal(confirmation.operation, 'squash');
    assert.match(
      confirmation.target,
      /^feature\/squash::[0-9a-f]{40}::[0-9a-f]{40}$/,
    );

    const result = await service.squash(
      repo,
      'project-1',
      'feature/squash',
      'feat: versão final',
      confirmation.token,
    );

    assert.equal(result.branch, 'feature/squash');
    assert.equal(await git(repo, 'rev-list', '--count', 'main..HEAD'), '1');
    assert.equal(await git(repo, 'log', '-1', '--format=%s'), 'feat: versão final');
    assert.equal(await git(repo, 'rev-parse', 'HEAD^{tree}'), originalTree);
    assert.equal(await readFile(path.join(repo, 'feature.txt'), 'utf8'), 'versão 3\n');
    assert.equal(await countSquashableBranchCommits(repo, 'feature/squash'), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('recusa squash quando a árvore de trabalho possui alterações', async () => {
  const { root, repo } = await createRepository();

  try {
    await writeFile(path.join(repo, 'dirty.txt'), 'não commitado\n');
    const service = new GitBranchSquashService();

    await assert.rejects(
      () => service.prepareConfirmation(repo, 'project-1', 'feature/squash'),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'GIT_WORKING_TREE_DIRTY',
        ),
    );
    assert.equal(await git(repo, 'rev-list', '--count', 'main..HEAD'), '3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('não oferece squash para main', async () => {
  const { root, repo } = await createRepository();

  try {
    await git(repo, 'switch', 'main');
    assert.equal(await countSquashableBranchCommits(repo, 'main'), 0);
    const service = new GitBranchSquashService();
    await assert.rejects(
      () => service.prepareConfirmation(repo, 'project-1', 'main'),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'GIT_PROTECTED_BRANCH',
        ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
