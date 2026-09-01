import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { GitService } from '../src/services/git-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync('git', [...args], { cwd });
}

async function makeRepo(): Promise<{
  root: string;
  pngBefore: Buffer;
  svgBefore: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-image-diff-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.email', 'dev@example.com']);
  await git(root, ['config', 'user.name', 'Dev']);
  await mkdir(path.join(root, 'public'), { recursive: true });

  const pngBefore = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02,
  ]);
  const svgBefore =
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>\n';

  await writeFile(path.join(root, 'public', 'hero.png'), pngBefore);
  await writeFile(path.join(root, 'public', 'icon.svg'), svgBefore);
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'imagens iniciais']);

  return { root, pngBefore, svgBefore };
}

test('getFileDiff inclui antes e depois para imagem binária', async (context) => {
  const { root, pngBefore } = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const pngAfter = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x03, 0x04,
  ]);
  await writeFile(path.join(root, 'public', 'hero.png'), pngAfter);

  const diff = await new GitService().getFileDiff(
    root,
    'public/hero.png',
    'combined',
  );

  assert.equal(diff.binary, true);
  assert.equal(diff.imagePreview?.before?.mimeType, 'image/png');
  assert.equal(diff.imagePreview?.after?.mimeType, 'image/png');
  assert.deepEqual(
    Buffer.from(diff.imagePreview?.before?.base64 ?? '', 'base64'),
    pngBefore,
  );
  assert.deepEqual(
    Buffer.from(diff.imagePreview?.after?.base64 ?? '', 'base64'),
    pngAfter,
  );
});

test('getFileDiff mantém diff textual e preview visual para SVG', async (context) => {
  const { root, svgBefore } = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const svgAfter =
    '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5" /></svg>\n';
  await writeFile(path.join(root, 'public', 'icon.svg'), svgAfter);

  const diff = await new GitService().getFileDiff(
    root,
    'public/icon.svg',
    'combined',
  );

  assert.equal(diff.binary, false);
  assert.match(diff.content, /circle/);
  assert.equal(diff.imagePreview?.before?.mimeType, 'image/svg+xml');
  assert.equal(diff.imagePreview?.after?.mimeType, 'image/svg+xml');
  assert.equal(
    Buffer.from(diff.imagePreview?.before?.base64 ?? '', 'base64').toString(
      'utf8',
    ),
    svgBefore,
  );
  assert.equal(
    Buffer.from(diff.imagePreview?.after?.base64 ?? '', 'base64').toString(
      'utf8',
    ),
    svgAfter,
  );
});

test('getFileDiff inclui antes e depois para PDF binário', async (context) => {
  const { root } = await makeRepo();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const pdfBefore = Buffer.from('%PDF-1.4\nantes\u0000fim\n%%EOF\n', 'utf8');
  const pdfAfter = Buffer.from('%PDF-1.4\ndepois\u0000fim\n%%EOF\n', 'utf8');
  const pdfPath = path.join(root, 'public', 'manual.pdf');

  await writeFile(pdfPath, pdfBefore);
  await git(root, ['add', 'public/manual.pdf']);
  await git(root, ['commit', '-q', '-m', 'adiciona pdf']);
  await writeFile(pdfPath, pdfAfter);

  const diff = await new GitService().getFileDiff(
    root,
    'public/manual.pdf',
    'combined',
  );

  assert.equal(diff.binary, true);
  assert.equal(diff.pdfPreview?.before?.mimeType, 'application/pdf');
  assert.equal(diff.pdfPreview?.after?.mimeType, 'application/pdf');
  assert.deepEqual(
    Buffer.from(diff.pdfPreview?.before?.base64 ?? '', 'base64'),
    pdfBefore,
  );
  assert.deepEqual(
    Buffer.from(diff.pdfPreview?.after?.base64 ?? '', 'base64'),
    pdfAfter,
  );
});

test('getFileDiff não lê preview de PDF por link simbólico fora do projeto', async (context) => {
  const { root } = await makeRepo();
  const outsideRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-pdf-outside-'),
  );
  context.after(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  });

  const secretPdf = Buffer.from(
    '%PDF-1.4\nconteudo-fora-do-projeto\u0000\n%%EOF\n',
    'utf8',
  );
  const outsidePdf = path.join(outsideRoot, 'secret.pdf');
  await writeFile(outsidePdf, secretPdf);
  await symlink(outsidePdf, path.join(root, 'public', 'leak.pdf'));

  const diff = await new GitService().getFileDiff(
    root,
    'public/leak.pdf',
    'combined',
  );

  assert.equal(diff.pdfPreview, undefined);
  assert.doesNotMatch(diff.content, /conteudo-fora-do-projeto/);
});

test('getFileDiff não lê preview de imagem por link simbólico fora do projeto', async (context) => {
  const { root } = await makeRepo();
  const outsideRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-image-outside-'),
  );
  context.after(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  });

  const outsideImage = path.join(outsideRoot, 'secret.png');
  await writeFile(
    outsideImage,
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x73, 0x65, 0x67, 0x72, 0x65, 0x64, 0x6f]),
  );
  await symlink(outsideImage, path.join(root, 'public', 'leak.png'));

  const diff = await new GitService().getFileDiff(
    root,
    'public/leak.png',
    'combined',
  );

  assert.equal(diff.imagePreview, undefined);
});
