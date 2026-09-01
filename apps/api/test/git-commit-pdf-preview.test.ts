import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { inspectGitCommitFile } from '../src/services/git-commit-details-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

test('histórico do commit entrega antes e depois de PDF modificado', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-pdf-history-'));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);

  const pdfBefore = Buffer.from('%PDF-1.4\nantes\u0000fim\n%%EOF\n', 'utf8');
  const pdfAfter = Buffer.from('%PDF-1.4\ndepois\u0000fim\n%%EOF\n', 'utf8');
  const filePath = path.join(root, 'manual.pdf');

  await writeFile(filePath, pdfBefore);
  await git(root, ['add', 'manual.pdf']);
  await git(root, ['commit', '-q', '-m', 'adiciona pdf']);

  await writeFile(filePath, pdfAfter);
  await git(root, ['add', 'manual.pdf']);
  await git(root, ['commit', '-q', '-m', 'atualiza pdf']);
  const commitHash = await git(root, ['rev-parse', 'HEAD']);

  const file = await inspectGitCommitFile(root, commitHash, 'manual.pdf');

  assert.equal(file.binary, true);
  assert.equal(file.pdfPreview?.before?.mimeType, 'application/pdf');
  assert.equal(file.pdfPreview?.after?.mimeType, 'application/pdf');
  assert.deepEqual(
    Buffer.from(file.pdfPreview?.before?.base64 ?? '', 'base64'),
    pdfBefore,
  );
  assert.deepEqual(
    Buffer.from(file.pdfPreview?.after?.base64 ?? '', 'base64'),
    pdfAfter,
  );
});

test('histórico de PDF adicionado entrega somente o lado atual', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-pdf-added-'));
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);
  await writeFile(path.join(root, 'README.md'), '# repo\n');
  await git(root, ['add', 'README.md']);
  await git(root, ['commit', '-q', '-m', 'base']);

  const pdf = Buffer.from('%PDF-1.4\nnovo\u0000fim\n%%EOF\n', 'utf8');
  await writeFile(path.join(root, 'manual.pdf'), pdf);
  await git(root, ['add', 'manual.pdf']);
  await git(root, ['commit', '-q', '-m', 'adiciona manual']);
  const commitHash = await git(root, ['rev-parse', 'HEAD']);

  const file = await inspectGitCommitFile(root, commitHash, 'manual.pdf');

  assert.equal(file.status, 'added');
  assert.equal(file.pdfPreview?.before, undefined);
  assert.equal(file.pdfPreview?.after?.mimeType, 'application/pdf');
  assert.deepEqual(
    Buffer.from(file.pdfPreview?.after?.base64 ?? '', 'base64'),
    pdf,
  );
});
