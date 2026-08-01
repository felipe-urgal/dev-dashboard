import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

async function readDatabaseLayoutCss(): Promise<string> {
  const arquivoPrincipal = await readFile(
    sourceFile('database-layout-polish.css'),
    'utf8',
  );
  const importados = await Promise.all(
    [...arquivoPrincipal.matchAll(/@import\s+'\.\/(database\/[^']+)'/g)].map(
      (correspondencia) => readFile(sourceFile(correspondencia[1] ?? ''), 'utf8'),
    ),
  );
  return [arquivoPrincipal, ...importados].join('\n');
}

test('oferece a navegação completa do explorador de banco', async () => {
  const component = await readFile(
    sourceFile('components/ProjectDatabasePanel.vue'),
    'utf8',
  );
  const railsMigrationsComposable = await readFile(
    sourceFile('composables/useRailsMigrations.ts'),
    'utf8',
  );
  const railsModelsComposable = await readFile(
    sourceFile('composables/useRailsModels.ts'),
    'utf8',
  );

  for (const label of [
    'Visão geral',
    'Ambientes',
    'Snapshots',
    'Migrations',
    'Modelos',
  ]) {
    assert.match(component, new RegExp(label));
  }

  assert.match(railsMigrationsComposable, /fetchProjectRailsMigrationDetail/);
  assert.match(railsModelsComposable, /fetchProjectRailsModels/);
  assert.match(component, /Código da migration/);
  assert.match(component, /Colunas \(\{\{ selectedTable\.columns\.length \}\}\)/);
  assert.match(component, /Relacionamentos/);
});

test('mantém o layout restrito ao painel de banco e baseado nos tokens de tema', async () => {
  const css = await readDatabaseLayoutCss();

  assert.match(css, /project-details-page:has\(> \.database-explorer\)/);
  assert.match(css, /\.database-explorer\s*\{/);
  assert.match(css, /var\(--surface-1\)/);
  assert.match(css, /var\(--text\)/);
  assert.match(css, /var\(--border\)/);
  assert.match(css, /var\(--accent\)/);
  assert.doesNotMatch(css, /\[data-theme=['"]dark['"]\]/);
});

test('implementa painéis, tabelas roláveis e adaptação responsiva', async () => {
  const css = await readDatabaseLayoutCss();

  assert.match(css, /database-metrics-grid/);
  assert.match(css, /database-split-layout/);
  assert.match(css, /database-migration-modal/);
  assert.match(css, /database-data-table thead[\s\S]*position:\s*sticky/);
  assert.match(css, /@media \(max-width: 940px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('carrega o polimento depois do redesign geral do detalhe', async () => {
  const main = await readFile(sourceFile('main.ts'), 'utf8');
  const redesignIndex = main.indexOf("import './project-details-redesign.css';");
  const databaseIndex = main.indexOf("import './database-layout-polish.css';");

  assert.ok(redesignIndex >= 0);
  assert.ok(databaseIndex > redesignIndex);
});

test('consulta detalhes de migrations e modelos pelas novas rotas', async () => {
  const api = await readFile(sourceFile('rails-explorer-api.ts'), 'utf8');

  assert.match(api, /rails\/migrations\/\$\{encodeURIComponent\(version\)\}/);
  assert.match(api, /rails\/models/);
  assert.match(api, /RailsMigrationDetail/);
  assert.match(api, /RailsModelsOverview/);
});
