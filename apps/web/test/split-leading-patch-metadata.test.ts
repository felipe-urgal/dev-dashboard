import assert from 'node:assert/strict';
import { test } from 'vitest';

import { splitLeadingPatchMetadata } from '../src/utils/split-leading-patch-metadata';

test('separa metadados técnicos antes do primeiro hunk', () => {
  const result = splitLeadingPatchMetadata([
    'diff --git a/app.ts b/app.ts',
    'index 123..456 100644',
    '--- a/app.ts',
    '+++ b/app.ts',
    '@@ -1,2 +1,2 @@',
    '-const value = 1;',
    '+const value = 2;',
  ]);

  assert.deepEqual(result.metadata, [
    'diff --git a/app.ts b/app.ts',
    'index 123..456 100644',
    '--- a/app.ts',
    '+++ b/app.ts',
  ]);
  assert.deepEqual(result.content, [
    '@@ -1,2 +1,2 @@',
    '-const value = 1;',
    '+const value = 2;',
  ]);
});

test('preserva o conteúdo quando o patch não possui cabeçalho recolhível', () => {
  const lines = ['@@ -1 +1 @@', '-antes', '+depois'];
  assert.deepEqual(splitLeadingPatchMetadata(lines), {
    metadata: [],
    content: lines,
  });
});

test('não trata um patch sem hunks como código revisável', () => {
  const lines = ['diff --git a/logo.png b/logo.png', 'Binary files differ'];
  assert.deepEqual(splitLeadingPatchMetadata(lines), {
    metadata: [],
    content: lines,
  });
});
