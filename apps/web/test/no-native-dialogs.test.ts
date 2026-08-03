import assert from 'node:assert/strict';
import {
  access,
  readdir,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import { test } from 'vitest';

const nativeDialogPattern = /\b(?:window|globalThis)\.(?:alert|confirm|prompt)\s*\(/g;

async function resolveSourceRoot(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), 'src'),
    path.resolve(process.cwd(), 'apps/web/src'),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Tenta o próximo diretório compatível com a execução do workspace.
    }
  }

  throw new Error(
    `Diretório fonte do frontend não encontrado a partir de ${process.cwd()}.`,
  );
}

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
  const sourceRoot = await resolveSourceRoot();
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
