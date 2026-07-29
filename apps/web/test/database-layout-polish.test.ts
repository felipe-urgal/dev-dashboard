import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

test('organiza o painel Rails em duas colunas sem afetar as demais abas', async () => {
  const css = await readFile(sourceFile('database-layout-polish.css'), 'utf8');

  assert.match(css, /project-details-page:has\(> \.rails-migrations-card\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(340px, 0\.55fr\)/);
  assert.match(css, /rails-routes-card[\s\S]*grid-column:\s*1 \/ -1/);
});

test('reduz a altura das tabelas extensas mantendo todo o conteudo rolavel', async () => {
  const css = await readFile(sourceFile('database-layout-polish.css'), 'utf8');

  assert.match(css, /migrations-table[\s\S]*overflow:\s*auto/);
  assert.match(css, /migrations-table[\s\S]*max-height:\s*520px/);
  assert.match(css, /routes-table[\s\S]*max-height:\s*min\(64vh, 680px\)/);
  assert.match(css, /thead[\s\S]*position:\s*sticky/);
});

test('carrega o polimento depois do redesign geral do detalhe', async () => {
  const main = await readFile(sourceFile('main.ts'), 'utf8');
  const redesignIndex = main.indexOf("import './project-details-redesign.css';");
  const databaseIndex = main.indexOf("import './database-layout-polish.css';");

  assert.ok(redesignIndex >= 0);
  assert.ok(databaseIndex > redesignIndex);
});
