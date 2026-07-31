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
  listCurrentBranchCommits,
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

test('pagina dez commits e limita o histórico à branch atual', async () => {
  const repository = await createRepository();
  try {
    const currentBranch = await run(repository.directory, ['branch', '--show-current']);
    for (let index = 1; index <= 14; index += 1) {
      const fileName = `commit-${index}.txt`;
      await writeFile(path.join(repository.directory, fileName), `${index}\n`, 'utf8');
      await run(repository.directory, ['add', fileName]);
      await run(repository.directory, ['commit', '-m', `commit ${index}`]);
    }

    const firstPage = await listCurrentBranchCommits(repository.directory, 1, 10);
    const secondPage = await listCurrentBranchCommits(repository.directory, 2, 10);
    assert.equal(firstPage.branch, currentBranch);
    assert.equal(firstPage.total, 15);
    assert.equal(firstPage.totalPages, 2);
    assert.equal(firstPage.commits.length, 10);
    assert.equal(firstPage.commits[0]?.subject, 'commit 14');
    assert.equal(firstPage.commits[0]?.parentCount, 1);
    assert.equal(secondPage.commits.length, 5);
    assert.equal(secondPage.commits.at(-1)?.subject, 'feat: cria projeto');
    assert.equal(secondPage.commits.at(-1)?.parentCount, 0);

    await run(repository.directory, ['switch', '--create', 'feature/isolada']);
    await writeFile(path.join(repository.directory, 'feature-only.txt'), 'feature\n', 'utf8');
    await run(repository.directory, ['add', 'feature-only.txt']);
    await run(repository.directory, ['commit', '-m', 'commit exclusivo da feature']);
    await run(repository.directory, ['switch', currentBranch]);

    const mainHistory = await listCurrentBranchCommits(repository.directory, 1, 10);
    assert.equal(mainHistory.total, 15);
    assert.ok(mainHistory.commits.every((commit) => commit.subject !== 'commit exclusivo da feature'));
  } finally {
    await rm(repository.directory, { recursive: true, force: true });
  }
});

test('busca em todos os commits antes de aplicar a paginação', async () => {
  const repository = await createRepository();
  try {
    await writeFile(path.join(repository.directory, 'target.txt'), 'alvo\n', 'utf8');
    await run(repository.directory, ['add', 'target.txt']);
    await run(repository.directory, ['commit', '-m', 'fix: commit alvo distante']);
    const targetHash = await run(repository.directory, ['rev-parse', 'HEAD']);

    for (let index = 1; index <= 12; index += 1) {
      const fileName = `recent-${index}.txt`;
      await writeFile(path.join(repository.directory, fileName), `${index}\n`, 'utf8');
      await run(repository.directory, ['add', fileName]);
      await run(repository.directory, ['commit', '-m', `feat: alteração recente ${index}`]);
    }

    const firstPage = await listBranchCommits(repository.directory, undefined, 1, 10);
    assert.ok(firstPage.commits.every((commit) => commit.hash !== targetHash));

    const byMessage = await listBranchCommits(
      repository.directory,
      undefined,
      1,
      10,
      { search: 'ALVO DISTANTE' },
    );
    assert.equal(byMessage.total, 1);
    assert.equal(byMessage.totalPages, 1);
    assert.equal(byMessage.commits[0]?.hash, targetHash);

    const byHash = await listBranchCommits(
      repository.directory,
      undefined,
      1,
      10,
      { search: targetHash.slice(0, 9) },
    );
    assert.equal(byHash.total, 1);
    assert.equal(byHash.commits[0]?.subject, 'fix: commit alvo distante');
  } finally {
    await rm(repository.directory, { recursive: true, force: true });
  }
});

test('consulta outra branch sem trocar o working tree', async () => {
  const repository = await createRepository();
  try {
    const currentBranch = await run(repository.directory, ['branch', '--show-current']);
    await run(repository.directory, ['switch', '--create', 'feature/historico']);
    await writeFile(path.join(repository.directory, 'history.txt'), 'history\n', 'utf8');
    await run(repository.directory, ['add', 'history.txt']);
    await run(repository.directory, ['commit', '-m', 'feat: adiciona histórico']);
    await run(repository.directory, ['switch', currentBranch]);

    const history = await listBranchCommits(
      repository.directory,
      'feature/historico',
      1,
      10,
    );

    assert.equal(history.branch, 'feature/historico');
    assert.equal(history.total, 2);
    assert.equal(history.commits[0]?.subject, 'feat: adiciona histórico');
    assert.equal(
      await run(repository.directory, ['branch', '--show-current']),
      currentBranch,
    );
  } finally {
    await rm(repository.directory, { recursive: true, force: true });
  }
});

test('recusa referência e hashes inválidos', async () => {
  const repository = await createRepository();
  try {
    await assert.rejects(
      () => listBranchCommits(repository.directory, '--all', 1, 10),
      (error: unknown) =>
        error instanceof GitCommitDetailsError && error.code === 'GIT_COMMIT_INVALID',
    );

    await assert.rejects(
      () => listBranchCommits(repository.directory, 'feature/inexistente', 1, 10),
      (error: unknown) =>
        error instanceof GitCommitDetailsError && error.code === 'GIT_COMMIT_NOT_FOUND',
    );

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

test('retorna o diff de um único arquivo do commit', async () => {
  const { directory } = await createRepository();
  await writeFile(path.join(directory, 'app.ts'), 'const valor = 1;\n', 'utf8');
  await writeFile(path.join(directory, 'outro.ts'), 'export const outro = true;\n', 'utf8');
  await run(directory, ['add', '.']);
  await run(directory, ['commit', '-m', 'feat: dois arquivos']);
  const hash = await run(directory, ['rev-parse', 'HEAD']);

  const file = await inspectGitCommitFile(directory, hash, 'app.ts');
  assert.equal(file.path, 'app.ts');
  assert.equal(file.status, 'added');
  assert.equal(file.binary, false);
  assert.match(file.content, /\+const valor = 1;/);
  // O diff é só do arquivo pedido.
  assert.ok(!file.content.includes('outro.ts'));

  await rm(directory, { recursive: true, force: true });
});

test('acompanha o caminho anterior de um arquivo renomeado', async () => {
  const { directory } = await createRepository();
  await writeFile(path.join(directory, 'antigo.ts'), 'export const valor = 1;\n'.repeat(6), 'utf8');
  await run(directory, ['add', 'antigo.ts']);
  await run(directory, ['commit', '-m', 'feat: cria arquivo']);
  await run(directory, ['mv', 'antigo.ts', 'novo.ts']);
  await run(directory, ['commit', '-am', 'refactor: renomeia arquivo']);
  const hash = await run(directory, ['rev-parse', 'HEAD']);

  const file = await inspectGitCommitFile(directory, hash, 'novo.ts');
  assert.equal(file.status, 'renamed');
  assert.match(file.content, /antigo\.ts/);

  await rm(directory, { recursive: true, force: true });
});

test('recusa arquivo que não faz parte do commit', async () => {
  const { directory, hash } = await createRepository();

  await assert.rejects(
    () => inspectGitCommitFile(directory, hash, '../../etc/passwd'),
    (error: unknown) => error instanceof GitCommitDetailsError && error.code === 'GIT_COMMIT_FILE_NOT_FOUND',
  );
  await assert.rejects(
    () => inspectGitCommitFile(directory, hash, 'app.ts'),
    (error: unknown) => error instanceof GitCommitDetailsError && error.code === 'GIT_COMMIT_FILE_NOT_FOUND',
  );

  await rm(directory, { recursive: true, force: true });
});

test('mascara segredos no diff do arquivo', async () => {
  const { directory } = await createRepository();
  await writeFile(path.join(directory, '.env'), 'API_TOKEN="s3cret1234567890abcdef"\n', 'utf8');
  await run(directory, ['add', '.env']);
  await run(directory, ['commit', '-m', 'chore: adiciona env']);
  const hash = await run(directory, ['rev-parse', 'HEAD']);

  const file = await inspectGitCommitFile(directory, hash, '.env');
  assert.equal(file.masked, true);
  assert.ok(!file.content.includes('s3cret1234567890abcdef'));

  await rm(directory, { recursive: true, force: true });
});

test('inclui arquivos renomeados na lista de arquivos do commit', async () => {
  const { directory } = await createRepository();
  await writeFile(path.join(directory, 'antigo.ts'), 'export const valor = 1;\n'.repeat(6), 'utf8');
  await run(directory, ['add', 'antigo.ts']);
  await run(directory, ['commit', '-m', 'feat: cria arquivo']);
  await run(directory, ['mv', 'antigo.ts', 'novo.ts']);
  await run(directory, ['commit', '-am', 'refactor: renomeia arquivo']);
  const hash = await run(directory, ['rev-parse', 'HEAD']);

  const detail = await inspectGitCommit(directory, hash);
  const renamed = detail.files.find((file) => file.path === 'novo.ts');
  assert.ok(renamed, `esperava novo.ts em ${JSON.stringify(detail.files.map((file) => file.path))}`);
  assert.equal(renamed!.status, 'renamed');
  assert.equal(renamed!.previousPath, 'antigo.ts');

  await rm(directory, { recursive: true, force: true });
});
