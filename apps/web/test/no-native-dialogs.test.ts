import assert from 'node:assert/strict';
import {
  readdir,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
const nativeDialogPattern = /\b(?:window|globalThis)\.(?:alert|confirm|prompt)\s*\(/g;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    if (!/\.(?:ts|vue)$/.test(entry.name)) return [];
    return [entryPath];
  }));

  return files.flat();
}

test('não usa alertas, confirmações ou prompts nativos no frontend', async () => {
  const violations: string[] = [];

  for (const filePath of await sourceFiles(sourceRoot)) {
    const content = await readFile(filePath, 'utf8');
    if (nativeDialogPattern.test(content)) {
      violations.push(path.relative(sourceRoot, filePath));
    }
    nativeDialogPattern.lastIndex = 0;
  }

  assert.deepEqual(
    violations,
    [],
    `Substitua diálogos nativos pelo app-dialog: ${violations.join(', ')}`,
  );
});
