import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  GitCommitDetailsError,
  inspectGitCommit,
} from '../src/services/git-commit-details-service.js';

const execFileAsync = promisify(execFile);

async function run(directory: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd: directory,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

async function createRepository(): Promise<{ directory: string; hash: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dev-dashboard-commit-'));
  await run(directory, ['init']);
  await run(directory, ['config', 'user.name', 'Dashboard Test']);
  await run(directory, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(directory, 'README.md'), '# Projeto\n', 'utf8');
  await run(directory, ['add', 'README.md']);
  await run(directory, ['commit', '-m', 'feat: cria projeto', '-m', 'Adiciona a documentação inicial.']);
  return {
    directory,
    hash: await run(directory, ['rev-parse', 'HEAD']),
  };
}

test('retorna metadados, arquivos e patch de um commit', async () => {
  const repository = await createRepository();
  try {
    const detail = await inspectGitCommit(repository.directory, repository.hash);

    assert.equal(detail.hash, repository.hash);
    assert.equal(detail.subject, 'feat: cria projeto');
    assert.match(detail.body, /documentação inicial/);
    assert.equal(detail.authorName, 'Dashboard Test');
    assert.equal(detail.files.length, 1);
    assert.equal(detail.files[0]?.path, 'README.md');
    assert.equal(detail.files[0]?.status, 'added');
    assert.equal(detail.additions, 1);
    assert.equal(detail.deletions, 0);
    assert.match(detail.patch, /\+\# Projeto/);
    assert.equal(detail.truncated, false);
  } finally {
    await rm(repository.directory, { recursive: true, force: true });
  }
});

test('recusa hash inválido e commit inexistente', async () => {
  const repository = await createRepository();
  try {
    await assert.rejects(
      () => inspectGitCommit(repository.directory, 'not-a-hash'),
      (error: unknown) =>
        error instanceof GitCommitDetailsError && error.code === 'GIT_COMMIT_INVALID',
    );

    await assert.rejects(
      () => inspectGitCommit(repository.directory, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      (error: unknown) =>
        error instanceof GitCommitDetailsError && error.code === 'GIT_COMMIT_NOT_FOUND',
    );
  } finally {
    await rm(repository.directory, { recursive: true, force: true });
  }
});
