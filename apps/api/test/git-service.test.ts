import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { GitService } from '../src/services/git-service.js';
const exec = promisify(execFile);
async function git(cwd: string, ...args: string[]) { await exec('git', args, { cwd }); }

test('returns a controlled response for a directory without git', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-no-git-'));
  try { const result = await new GitService().getOverview(directory); assert.equal(result.repository, false); assert.deepEqual(result.files, []); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

test('reads branch, commits and working tree changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-'));
  try {
    await git(directory, 'init', '-b', 'main');
    await git(directory, 'config', 'user.name', 'Dashboard Test');
    await git(directory, 'config', 'user.email', 'dashboard@example.test');
    await writeFile(path.join(directory, 'tracked.txt'), 'first\n');
    await git(directory, 'add', 'tracked.txt');
    await git(directory, 'commit', '-m', 'initial commit');
    await writeFile(path.join(directory, 'tracked.txt'), 'changed\n');
    await writeFile(path.join(directory, 'new file.txt'), 'new\n');
    const result = await new GitService().getOverview(directory);
    assert.equal(result.repository, true);
    assert.equal(result.branch, 'main');
    assert.equal(result.clean, false);
    assert.equal(result.latestCommit?.subject, 'initial commit');
    assert.ok(result.files.some((file) => file.path === 'tracked.txt' && file.status === 'modified'));
    assert.ok(result.files.some((file) => file.path === 'new file.txt' && file.status === 'untracked'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
