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

test('getDiffSnapshot lista arquivos alterados com additions/deletions', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  await writeFile(path.join(root, 'README.md'), 'v1\nv2\n');
  await writeFile(path.join(root, 'src', 'app.ts'), 'const value = 42;\n');

  const service = new GitService();
  const snapshot = await service.getDiffSnapshot(root, 'combined');
  assert.equal(snapshot.repository, true);
  assert.equal(snapshot.scope, 'combined');
  const byPath = new Map(snapshot.files.map((file) => [file.path, file]));
  const readme = byPath.get('README.md');
  const app = byPath.get('src/app.ts');
  assert.ok(readme, 'README.md deve aparecer no snapshot');
  assert.ok(app, 'src/app.ts deve aparecer no snapshot');
  assert.equal(readme!.additions, 1);
  assert.equal(readme!.deletions, 0);
  assert.equal(app!.additions, 1);
  assert.equal(app!.deletions, 1);
});

test('getFileDiff mascara segredos e sinaliza truncamento', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  const bigContent = 'password="s3cret1234567890abcdef"\n' + 'x'.repeat(300_000);
  await writeFile(path.join(root, 'src', 'app.ts'), bigContent);

  const service = new GitService();
  const diff = await service.getFileDiff(root, 'src/app.ts', 'combined');
  assert.equal(diff.path, 'src/app.ts');
  assert.equal(diff.binary, false);
  assert.equal(diff.masked, true, 'esperava mascaramento do segredo detectado');
  assert.ok(diff.redactionCount >= 1);
  assert.equal(diff.truncated, true);
  assert.ok(!diff.content.includes('s3cret1234567890abcdef'), 'segredo não pode aparecer no conteúdo mascarado');
});

test('getFileDiff rejeita path fora do projeto', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  await assert.rejects(
    () => service.getFileDiff(root, '../etc/passwd', 'combined'),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_PATH_OUTSIDE_PROJECT',
  );
  await assert.rejects(
    () => service.getFileDiff(root, '/etc/passwd', 'combined'),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_PATH_OUTSIDE_PROJECT',
  );
  await assert.rejects(
    () => service.getFileDiff(root, '', 'combined'),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_PATH_INVALID',
  );
});

test('getDiffSnapshot em repositório sem commits compara contra a árvore vazia', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-git-empty-'));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(root, 'first.md'), 'olá\n');
  await git(root, ['add', 'first.md']);

  const service = new GitService();
  const snapshot = await service.getDiffSnapshot(root, 'combined');
  assert.equal(snapshot.repository, true);
  const paths = snapshot.files.map((file) => file.path);
  assert.ok(paths.includes('first.md'), `esperava first.md no snapshot, obteve ${JSON.stringify(paths)}`);

  const fileDiff = await service.getFileDiff(root, 'first.md', 'combined');
  assert.equal(fileDiff.binary, false);
  assert.match(fileDiff.content, /\+olá/);
});

test('getDiffSnapshot detecta renomes e preserva previousPath', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await git(root, ['mv', 'src/app.ts', 'src/renamed.ts']);

  const service = new GitService();
  const snapshot = await service.getDiffSnapshot(root, 'combined');
  const renamed = snapshot.files.find((file) => file.path === 'src/renamed.ts');
  assert.ok(renamed, `esperava src/renamed.ts em ${JSON.stringify(snapshot.files.map((f) => f.path))}`);
  assert.equal(renamed!.previousPath, 'src/app.ts');
  assert.equal(renamed!.status, 'renamed');
});

test('getDiffSnapshot para diretório não git retorna repository=false', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-nongit-'));
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  const service = new GitService();
  const snapshot = await service.getDiffSnapshot(root, 'combined');
  assert.equal(snapshot.repository, false);
  assert.deepEqual(snapshot.files, []);
});

test('getFileLines devolve a faixa pedida do arquivo alterado', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  const lines = Array.from({ length: 40 }, (_unused, index) => `linha ${index + 1}`);
  await writeFile(path.join(root, 'src', 'app.ts'), `${lines.join('\n')}\n`);

  const service = new GitService();
  const result = await service.getFileLines(root, 'src/app.ts', 'combined', 5, 8);
  assert.equal(result.path, 'src/app.ts');
  assert.equal(result.start, 5);
  assert.equal(result.end, 8);
  assert.equal(result.totalLines, 40);
  assert.deepEqual(result.lines, ['linha 5', 'linha 6', 'linha 7', 'linha 8']);
});

test('getFileLines recorta a faixa ao fim do arquivo', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'src', 'app.ts'), 'um\ndois\ntrês\n');

  const service = new GitService();
  const result = await service.getFileLines(root, 'src/app.ts', 'combined', 2, 90);
  assert.equal(result.end, 3);
  assert.deepEqual(result.lines, ['dois', 'três']);
});

test('getFileLines lê o blob do índice quando o escopo é index', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });

  await writeFile(path.join(root, 'src', 'app.ts'), 'staged\n');
  await git(root, ['add', 'src/app.ts']);
  await writeFile(path.join(root, 'src', 'app.ts'), 'worktree\n');

  const service = new GitService();
  const staged = await service.getFileLines(root, 'src/app.ts', 'index', 1, 1);
  assert.deepEqual(staged.lines, ['staged']);
  const worktree = await service.getFileLines(root, 'src/app.ts', 'combined', 1, 1);
  assert.deepEqual(worktree.lines, ['worktree']);
});

test('getFileLines mascara segredos do trecho lido', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'src', 'app.ts'), 'password="s3cret1234567890abcdef"\nfim\n');

  const service = new GitService();
  const result = await service.getFileLines(root, 'src/app.ts', 'combined', 1, 2);
  assert.equal(result.masked, true);
  assert.ok(result.redactionCount > 0);
  assert.ok(!result.lines.join('\n').includes('s3cret1234567890abcdef'));
});

test('getFileLines recusa caminho fora do projeto', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'src', 'app.ts'), 'alterado\n');

  const service = new GitService();
  await assert.rejects(
    () => service.getFileLines(root, '../../etc/passwd', 'combined', 1, 5),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_PATH_OUTSIDE_PROJECT',
  );
});

test('getFileLines recusa arquivo que não está no diff do escopo', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'src', 'app.ts'), 'alterado\n');

  const service = new GitService();
  await assert.rejects(
    () => service.getFileLines(root, 'README.md', 'combined', 1, 5),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_PATH_NOT_IN_DIFF',
  );
});

test('getFileLines recusa faixa invertida ou grande demais', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await writeFile(path.join(root, 'src', 'app.ts'), 'alterado\n');

  const service = new GitService();
  await assert.rejects(
    () => service.getFileLines(root, 'src/app.ts', 'combined', 9, 2),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_RANGE_INVALID',
  );
  await assert.rejects(
    () => service.getFileLines(root, 'src/app.ts', 'combined', 1, 5_000),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_RANGE_INVALID',
  );
});

test('getFileLines recusa arquivo removido', async (context) => {
  const root = await makeRepo();
  context.after(async () => { await rm(root, { recursive: true, force: true }); });
  await git(root, ['rm', '-q', 'src/app.ts']);

  const service = new GitService();
  await assert.rejects(
    () => service.getFileLines(root, 'src/app.ts', 'combined', 1, 5),
    (error: unknown) => error instanceof GitDiffError && error.code === 'GIT_DIFF_LINES_UNAVAILABLE',
  );
});
