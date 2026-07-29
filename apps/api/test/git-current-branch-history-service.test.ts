import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { listCurrentBranchOnlyCommits } from '../src/services/git-current-branch-history-service.js';

const execFileAsync = promisify(execFile);

async function git(directory: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: directory,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

async function commitFile(
  directory: string,
  fileName: string,
  content: string,
  message: string,
): Promise<void> {
  await writeFile(path.join(directory, fileName), content, 'utf8');
  await git(directory, ['add', fileName]);
  await git(directory, ['commit', '-m', message]);
}

test('lista somente commits criados depois da divergencia da branch principal', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-branch-history-'));

  try {
    await git(directory, ['init', '-b', 'main']);
    await git(directory, ['config', 'user.name', 'Dev Dashboard']);
    await git(directory, ['config', 'user.email', 'dashboard@example.test']);

    await commitFile(directory, 'base.txt', 'base 1\n', 'feat: cria base');
    await commitFile(directory, 'base.txt', 'base 2\n', 'feat: atualiza base');

    await git(directory, ['switch', '-c', 'feature/remove-conteudo-orfao']);
    await commitFile(
      directory,
      'feature.txt',
      'feature\n',
      'fix(observatorio): remove conteudo orfao',
    );

    const featureHistory = await listCurrentBranchOnlyCommits(directory);
    assert.equal(featureHistory.branch, 'feature/remove-conteudo-orfao');
    assert.equal(featureHistory.total, 1);
    assert.equal(featureHistory.commits.length, 1);
    assert.equal(
      featureHistory.commits[0]?.subject,
      'fix(observatorio): remove conteudo orfao',
    );

    const baseSearch = await listCurrentBranchOnlyCommits(directory, {
      search: 'atualiza base',
    });
    assert.equal(baseSearch.total, 0);

    await git(directory, ['switch', 'main']);
    const mainHistory = await listCurrentBranchOnlyCommits(directory);
    assert.equal(mainHistory.branch, 'main');
    assert.equal(mainHistory.total, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
