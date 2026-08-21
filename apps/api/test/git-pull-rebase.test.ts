import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { GitService } from '../src/services/git-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', args as string[], {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

async function configureIdentity(cwd: string): Promise<void> {
  await git(cwd, ['config', 'user.email', 'dev@example.com']);
  await git(cwd, ['config', 'user.name', 'Dev']);
}

test('pull reaplica commits locais por rebase quando branch de trabalho divergiu', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-pull-rebase-'));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const origin = path.join(root, 'origin.git');
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');

  await execFileAsync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  await execFileAsync('git', ['clone', '-q', origin, first]);
  await configureIdentity(first);
  await writeFile(path.join(first, 'README.md'), 'inicial\n');
  await git(first, ['add', '.']);
  await git(first, ['commit', '-q', '-m', 'init']);
  await git(first, ['push', '-q', '-u', 'origin', 'main']);
  await git(first, ['switch', '-c', 'feature/colaborativa']);
  await git(first, ['push', '-q', '-u', 'origin', 'feature/colaborativa']);

  await execFileAsync('git', ['clone', '-q', origin, second]);
  await configureIdentity(second);
  await git(second, ['switch', '--track', 'origin/feature/colaborativa']);

  await writeFile(path.join(first, 'remoto.txt'), 'remoto\n');
  await git(first, ['add', '.']);
  await git(first, ['commit', '-q', '-m', 'commit remoto']);
  await git(first, ['push', '-q']);

  await writeFile(path.join(second, 'local.txt'), 'local\n');
  await git(second, ['add', '.']);
  await git(second, ['commit', '-q', '-m', 'commit local']);

  const service = new GitService();
  const confirmation = service.prepareMutationConfirmation(
    'p1',
    'pull',
    'feature/colaborativa',
  );
  const result = await service.pull(second, 'p1', confirmation.token);

  assert.equal(result.branch, 'feature/colaborativa');
  assert.equal(await git(second, ['rev-list', '--count', 'origin/feature/colaborativa..HEAD']), '1');
  assert.equal(await git(second, ['rev-list', '--count', 'HEAD..origin/feature/colaborativa']), '0');
  assert.equal(await git(second, ['show', 'HEAD:local.txt']), 'local');
  assert.equal(await git(second, ['show', 'HEAD:remoto.txt']), 'remoto');
});
