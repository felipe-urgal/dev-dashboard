import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  findGitPatchForFile,
  splitGitPatchByFile,
} from '../src/utils/git-file-patch';

const patch = [
  'diff --git a/src/old-name.ts b/src/new-name.ts',
  'similarity index 80%',
  'rename from src/old-name.ts',
  'rename to src/new-name.ts',
  '--- a/src/old-name.ts',
  '+++ b/src/new-name.ts',
  '@@ -1 +1 @@',
  '-export const value = 1;',
  '+export const value = 2;',
  'diff --git a/README.md b/README.md',
  'index 1111111..2222222 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1,2 @@',
  ' # Projeto',
  '+Documentação nova',
].join('\n');

test('separa um patch completo em blocos por arquivo', () => {
  const files = splitGitPatchByFile(patch);

  assert.equal(files.length, 2);
  assert.equal(files[0]?.oldPath, 'src/old-name.ts');
  assert.equal(files[0]?.newPath, 'src/new-name.ts');
  assert.match(files[1]?.content ?? '', /Documentação nova/);
});

test('localiza o patch pelo caminho atual ou anterior', () => {
  const renamed = findGitPatchForFile(patch, 'src/new-name.ts', 'src/old-name.ts');
  const readme = findGitPatchForFile(patch, 'README.md');

  assert.match(renamed?.content ?? '', /value = 2/);
  assert.match(readme?.content ?? '', /# Projeto/);
});

test('retorna undefined quando o arquivo não está no patch', () => {
  assert.equal(findGitPatchForFile(patch, 'src/missing.ts'), undefined);
});
