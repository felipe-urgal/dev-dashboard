import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { listMarkdownFiles, README_DISCOVERY_LIMITS } from '../src/routes/project-readme.js';

test('README discovery é determinístico, bounded e indica truncamento', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'readme-discovery-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (let i = 0; i < README_DISCOVERY_LIMITS.files + 10; i++) {
    await writeFile(path.join(root, `doc-${String(i).padStart(4, '0')}.md`), '# Documento');
  }
  await writeFile(path.join(root, 'README.md'), '# Principal');
  const first = await listMarkdownFiles(root);
  const second = await listMarkdownFiles(root);
  assert.equal(first.truncated, true);
  assert.equal(first.files.length, README_DISCOVERY_LIMITS.files);
  assert.deepEqual(first, second);
  assert.ok(first.files.every(file => file.kind === 'file'));
});

test('ignora diretórios sensíveis e symlinks externos', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'readme-secure-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'readme-outside-'));
  context.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await mkdir(path.join(root, 'node_modules'));
  await mkdir(path.join(root, '.git'));
  await writeFile(path.join(root, 'node_modules', 'README.md'), 'ignored');
  await writeFile(path.join(root, '.git', 'README.md'), 'ignored');
  await writeFile(path.join(outside, 'secret.md'), 'outside');
  await symlink(outside, path.join(root, 'linked'));
  await writeFile(path.join(root, 'README.md'), 'safe');
  const result = await listMarkdownFiles(root);
  assert.deepEqual(result.files.map(f => f.path), ['README.md']);
  assert.equal(result.truncated, false);
});

test('profundidade máxima limita varredura', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'readme-depth-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  let current = root;
  for (let i = 0; i < README_DISCOVERY_LIMITS.depth + 2; i++) {
    current = path.join(current, 'docs');
    await mkdir(current);
  }
  await writeFile(path.join(current, 'deep.md'), 'deep');
  const result = await listMarkdownFiles(root);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.files, []);
});
