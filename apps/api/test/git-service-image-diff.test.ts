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
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x00, 0x73, 0x65, 0x67, 0x72, 0x65, 0x64, 0x6f,
    ]),
  );
  await symlink(outsideImage, path.join(root, 'public', 'leak.png'));

  const diff = await new GitService().getFileDiff(
    root,
    'public/leak.png',
    'combined',
  );

  assert.equal(diff.imagePreview, undefined);
});
