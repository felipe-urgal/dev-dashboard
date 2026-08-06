import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { GitWorkspaceService } from '../src/services/git-workspace-service.js';

const exec = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<void> {
  await exec('git', args, { cwd });
}

test('lists local, origin and upstream branches with commit and tracking details', async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-git-workspace-'),
  );
  const local = path.join(root, 'local');
  const origin = path.join(root, 'origin.git');
  const upstream = path.join(root, 'upstream.git');

  try {
    await git(root, 'init', '--bare', '--initial-branch=main', origin);
    await git(root, 'init', '--bare', '--initial-branch=main', upstream);
    await git(root, 'init', '--initial-branch=main', local);
    await git(local, 'config', 'user.name', 'Dashboard Test');
    await git(local, 'config', 'user.email', 'dashboard@example.test');

    await writeFile(path.join(local, 'README.md'), '# Teste\n');
    await git(local, 'add', 'README.md');
    await git(local, 'commit', '-m', 'initial commit');
    await git(local, 'remote', 'add', 'origin', origin);
    await git(local, 'remote', 'add', 'upstream', upstream);
    await git(local, 'push', '--set-upstream', 'origin', 'main');
    await git(local, 'push', 'upstream', 'main');
    await git(local, 'fetch', 'upstream');

    await git(local, 'switch', '--create', 'feature/git-workspace');
    await writeFile(path.join(local, 'feature.txt'), 'feature\n');
    await git(local, 'add', 'feature.txt');
    await git(local, 'commit', '-m', 'feature commit');
    await git(
      local,
      'push',
      '--set-upstream',
      'origin',
      'feature/git-workspace',
    );

    const workspace = await new GitWorkspaceService().inspect(local);

    assert.equal(
      workspace.remotes.find((remote) => remote.name === 'origin')?.role,
      'origin',
    );
    assert.equal(
      workspace.remotes.find((remote) => remote.name === 'upstream')?.role,
      'upstream',
    );

    const current = workspace.branches.find(
      (branch) =>
        branch.kind === 'local' && branch.name === 'feature/git-workspace',
    );
    assert.equal(current?.current, true);
    assert.equal(current?.upstream, 'origin/feature/git-workspace');
    assert.equal(current?.ahead, 0);
    assert.equal(current?.behind, 0);
    assert.equal(current?.latestCommit?.subject, 'feature commit');
    assert.equal(current?.latestCommit?.authorName, 'Dashboard Test');
    assert.equal(current?.latestCommit?.authorEmail, 'dashboard@example.test');

    const originFeature = workspace.branches.find(
      (branch) => branch.name === 'origin/feature/git-workspace',
    );
    assert.equal(originFeature?.latestCommit?.subject, 'feature commit');
    assert.equal(originFeature?.ahead, 0);
    assert.equal(originFeature?.behind, 0);

    assert.ok(
      workspace.branches.some((branch) => branch.name === 'upstream/main'),
    );
    assert.deepEqual(workspace.originComparison, {
      reference: 'origin/feature/git-workspace',
      ahead: 0,
      behind: 0,
    });
    assert.deepEqual(workspace.upstreamComparison, {
      reference: 'upstream/main',
      ahead: 1,
      behind: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('returns empty collections outside a git repository', async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'dashboard-git-workspace-empty-'),
  );

  try {
    const workspace = await new GitWorkspaceService().inspect(directory);
    assert.deepEqual(workspace, { branches: [], remotes: [] });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
