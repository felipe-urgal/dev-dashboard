import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

async function readScriptsExplorerCss(): Promise<string> {
  const arquivoPrincipal = await readFile(
    sourceFile('scripts-explorer-redesign.css'),
    'utf8',
  );
  const importados = await Promise.all(
    [...arquivoPrincipal.matchAll(/@import\s+'\.\/(scripts-explorer\/[^']+)'/g)].map(
      (correspondencia) => readFile(sourceFile(correspondencia[1] ?? ''), 'utf8'),
    ),
  );
  return [arquivoPrincipal, ...importados].join('\n');
}

test('estrutura scripts como explorador com visão geral, catálogo e execuções', async () => {
  const component = await readFile(
    sourceFile('components/ProjectScriptsPanel.vue'),
    'utf8',
  );

  assert.match(component, /type ScriptSection = 'overview' \| 'catalog' \| 'executions'/);
  assert.match(component, /label: 'Visão geral'/);
  assert.match(component, /label: 'Catálogo'/);
  assert.match(component, /label: 'Execuções'/);
  assert.match(component, /class="scripts-catalog-layout"/);
  assert.match(component, /class="scripts-detail-panel"/);
  assert.match(component, /class="scripts-executions-layout"/);
  assert.match(component, /class="scripts-log-panel"/);
});

test('mantém risco, confirmação e acompanhamento da execução no redesenho', async () => {
  const component = await readFile(
    sourceFile('components/ProjectScriptsPanel.vue'),
    'utf8',
  );

  assert.match(component, /item\.risk !== 'read-only'/);
  assert.match(component, /prepareScriptExecution/);
  assert.match(component, /followScriptExecutionEvents/);
  assert.match(component, /cancelScriptExecution/);
  assert.match(component, /maskedLogEntries/);
  assert.match(component, /class="script-card"/);
});

test('aplica layout responsivo usando os tokens dos temas claro e escuro', async () => {
  const css = await readScriptsExplorerCss();
  const main = await readFile(sourceFile('main.ts'), 'utf8');

  assert.match(css, /\.scripts-explorer\s*\{/);
  assert.match(css, /var\(--surface-1\)/);
  assert.match(css, /var\(--text\)/);
  assert.match(css, /var\(--accent\)/);
  assert.match(css, /scripts-catalog-layout[\s\S]*grid-template-columns/);
  assert.match(css, /scripts-executions-layout[\s\S]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(main, /import '\.\/scripts-explorer-redesign\.css';/);
});
