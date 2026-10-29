import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { GitDiffError, GitService } from '../src/services/git-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', args as string[], { cwd });
}

async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-diff-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src', 'app.ts'), 'const value = 1;\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'init']);
  return root;
}

test('getFileDiff mascara segredos e sinaliza truncamento', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const bigContent =
    'password="s3cret1234567890abcdef"\n' + 'x'.repeat(300_000);
  await writeFile(path.join(root, 'src', 'app.ts'), bigContent);

  const service = new GitService();
  const diff = await service.getFileDiff(root, 'src/app.ts', 'combined');
  assert.equal(diff.path, 'src/app.ts');
  assert.equal(diff.binary, false);
  assert.equal(diff.masked, true, 'esperava mascaramento do segredo detectado');
  assert.ok(diff.redactionCount >= 1);
  assert.equal(diff.truncated, true);
  assert.ok(
    !diff.content.includes('s3cret1234567890abcdef'),
    'segredo não pode aparecer no conteúdo mascarado',
  );
});

test('getFileDiff rejeita path fora do projeto', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const service = new GitService();
  await assert.rejects(
    () => service.getFileDiff(root, '../etc/passwd', 'combined'),
    (error: unknown) =>
      error instanceof GitDiffError &&
      error.code === 'GIT_DIFF_PATH_OUTSIDE_PROJECT',
  );
  await assert.rejects(
    () => service.getFileDiff(root, '/etc/passwd', 'combined'),
    (error: unknown) =>
      error instanceof GitDiffError &&
      error.code === 'GIT_DIFF_PATH_OUTSIDE_PROJECT',
  );
  await assert.rejects(
    () => service.getFileDiff(root, '', 'combined'),
    (error: unknown) =>
      error instanceof GitDiffError && error.code === 'GIT_DIFF_PATH_INVALID',
  );
});

test('getFileLines mascara segredos do trecho lido', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(
    path.join(root, 'src', 'app.ts'),
    'password="s3cret1234567890abcdef"\nfim\n',
  );

  const service = new GitService();
  const result = await service.getFileLines(
    root,
    'src/app.ts',
    'combined',
    1,
    2,
  );
  assert.equal(result.masked, true);
  assert.ok(result.redactionCount > 0);
  assert.ok(!result.lines.join('\n').includes('s3cret1234567890abcdef'));
});

test('getFileLines recusa caminho fora do projeto', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(path.join(root, 'src', 'app.ts'), 'alterado\n');

  const service = new GitService();
  await assert.rejects(
    () => service.getFileLines(root, '../../etc/passwd', 'combined', 1, 5),
    (error: unknown) =>
      error instanceof GitDiffError &&
      error.code === 'GIT_DIFF_PATH_OUTSIDE_PROJECT',
  );
});

test('getFileLines recusa arquivo que não está no diff do escopo', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(path.join(root, 'src', 'app.ts'), 'alterado\n');

  const service = new GitService();
  await assert.rejects(
    () => service.getFileLines(root, 'README.md', 'combined', 1, 5),
    (error: unknown) =>
      error instanceof GitDiffError &&
      error.code === 'GIT_DIFF_PATH_NOT_IN_DIFF',
  );
});

test('getFileLines recusa faixa invertida ou grande demais', async (context) => {
  const root = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(path.join(root, 'src', 'app.ts'), 'alterado\n');

  const service = new GitService();
  await assert.rejects(
    () => service.getFileLines(root, 'src/app.ts', 'combined', 9, 2),
    (error: unknown) =>
      error instanceof GitDiffError && error.code === 'GIT_DIFF_RANGE_INVALID',
  );
  await assert.rejects(
    () => service.getFileLines(root, 'src/app.ts', 'combined', 1, 5_000),
    (error: unknown) =>
      error instanceof GitDiffError && error.code === 'GIT_DIFF_RANGE_INVALID',
  );
});
