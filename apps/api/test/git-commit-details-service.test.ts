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
  inspectGitCommitFile,
  listBranchCommits,
} from '../src/services/git-commit-details-service.js';

const execFileAsync = promisify(execFile);

async function run(directory: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd: directory,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

async function createRepository(): Promise<{
  directory: string;
  hash: string;
}> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-commit-'),
  );
  await run(directory, ['init']);
  await run(directory, ['config', 'user.name', 'Dashboard Test']);
  await run(directory, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(directory, 'README.md'), '# Projeto\n', 'utf8');
  await run(directory, ['add', 'README.md']);
  await run(directory, [
    'commit',
    '-m',
    'feat: cria projeto',
    '-m',
    'Adiciona a documentação inicial.',
  ]);
  return {
    directory,
    hash: await run(directory, ['rev-parse', 'HEAD']),
  };
}

test('recusa referência e hashes inválidos', async () => {
  const repository = await createRepository();
  try {
    await assert.rejects(
      () => listBranchCommits(repository.directory, '--all', 1, 10),
      (error: unknown) =>
        error instanceof GitCommitDetailsError &&
        error.code === 'GIT_COMMIT_INVALID',
    );

    await assert.rejects(
      () =>
        listBranchCommits(repository.directory, 'feature/inexistente', 1, 10),
      (error: unknown) =>
        error instanceof GitCommitDetailsError &&
        error.code === 'GIT_COMMIT_NOT_FOUND',
    );

    await assert.rejects(
      () => inspectGitCommit(repository.directory, 'not-a-hash'),
      (error: unknown) =>
        error instanceof GitCommitDetailsError &&
        error.code === 'GIT_COMMIT_INVALID',
    );

    await assert.rejects(
      () =>
        inspectGitCommit(
          repository.directory,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ),
      (error: unknown) =>
        error instanceof GitCommitDetailsError &&
        error.code === 'GIT_COMMIT_NOT_FOUND',
    );
  } finally {
    await rm(repository.directory, { recursive: true, force: true });
  }
});

test('recusa arquivo que não faz parte do commit', async () => {
  const { directory, hash } = await createRepository();

  await assert.rejects(
    () => inspectGitCommitFile(directory, hash, '../../etc/passwd'),
    (error: unknown) =>
      error instanceof GitCommitDetailsError &&
      error.code === 'GIT_COMMIT_FILE_NOT_FOUND',
  );
  await assert.rejects(
    () => inspectGitCommitFile(directory, hash, 'app.ts'),
    (error: unknown) =>
      error instanceof GitCommitDetailsError &&
      error.code === 'GIT_COMMIT_FILE_NOT_FOUND',
  );

  await rm(directory, { recursive: true, force: true });
});

test('mascara segredos no diff do arquivo', async () => {
  const { directory } = await createRepository();
  await writeFile(
    path.join(directory, '.env'),
    'API_TOKEN="s3cret1234567890abcdef"\n',
    'utf8',
  );
  await run(directory, ['add', '.env']);
  await run(directory, ['commit', '-m', 'chore: adiciona env']);
  const hash = await run(directory, ['rev-parse', 'HEAD']);

  const file = await inspectGitCommitFile(directory, hash, '.env');
  assert.equal(file.masked, true);
  assert.ok(!file.content.includes('s3cret1234567890abcdef'));

  await rm(directory, { recursive: true, force: true });
});
