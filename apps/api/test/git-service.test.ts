import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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


test('stages, unstages, discards and removes files safely', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-git-files-'));
  const service = new GitService();
  try {
    await git(directory, 'init', '-b', 'main');
    await git(directory, 'config', 'user.name', 'Dashboard Test');
    await git(directory, 'config', 'user.email', 'dashboard@example.test');
    await writeFile(path.join(directory, 'tracked file.txt'), 'first\n');
    await git(directory, 'add', 'tracked file.txt');
    await git(directory, 'commit', '-m', 'initial commit');

    await writeFile(path.join(directory, 'tracked file.txt'), 'changed\n');
    await writeFile(path.join(directory, 'new file.txt'), 'new\n');

    await service.stageFile(directory, 'tracked file.txt');
    let overview = await service.getOverview(directory);
    assert.equal(
      overview.files.find((file) => file.path === 'tracked file.txt')?.indexStatus,
      'M',
    );

    await service.unstageFile(directory, 'tracked file.txt');
    overview = await service.getOverview(directory);
    assert.equal(
      overview.files.find((file) => file.path === 'tracked file.txt')?.indexStatus,
      '.',
    );

    const discard = service.prepareMutationConfirmation(
      'project-1',
      'discard-file',
      'tracked file.txt',
    );
    await service.discardFile(
      directory,
      'project-1',
      'tracked file.txt',
      discard.token,
    );
    assert.equal(
      await readFile(path.join(directory, 'tracked file.txt'), 'utf8'),
      'first\n',
    );

    const remove = service.prepareMutationConfirmation(
      'project-1',
      'remove-untracked-file',
      'new file.txt',
    );
    await service.removeUntrackedFile(
      directory,
      'project-1',
      'new file.txt',
      remove.token,
    );
    await assert.rejects(access(path.join(directory, 'new file.txt')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
