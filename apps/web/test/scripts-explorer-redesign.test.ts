import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

async function readScriptsExplorerCss(): Promise<string> {
  const arquivoPrincipal = await readFile(
    sourceFile('styles/features/scripts-explorer-redesign.css'),
    'utf8',
  );
  const importados = await Promise.all(
    [
      ...arquivoPrincipal.matchAll(
        /@import\s+'\.\.\/\.\.\/(scripts-explorer\/[^']+)'/g,
      ),
    ].map((correspondencia) =>
      readFile(sourceFile(correspondencia[1] ?? ''), 'utf8'),
    ),
  );
  return [arquivoPrincipal, ...importados].join('\n');
}

async function readScriptsExplorerSources(): Promise<string> {
  const files = [
    'components/ProjectScriptsPanel.vue',
    'composables/useProjectScriptsPanel.ts',
  ];
  return (
    await Promise.all(files.map((file) => readFile(sourceFile(file), 'utf8')))
  ).join('\n');
}

test('estrutura scripts como explorador direto de catálogo e execuções', async () => {
  const component = await readScriptsExplorerSources();

  assert.match(component, /Projeto \/ Scripts/);
  assert.match(component, />Execuções</);
  assert.match(component, /class="scripts-executions-layout"/);
  assert.match(component, /class="scripts-log-panel[ "]/);
});

test('mantém risco, confirmação e acompanhamento da execução no redesenho', async () => {
  const component = await readScriptsExplorerSources();
  const executionComposable = await readFile(
    sourceFile('composables/useScriptExecution.ts'),
    'utf8',
  );

  assert.match(executionComposable, /item\.risk !== 'read-only'/);
  assert.match(executionComposable, /prepareScriptExecution/);
  assert.match(executionComposable, /followScriptExecutionEvents/);
  assert.match(executionComposable, /cancelScriptExecution/);
  assert.match(component, /maskedLogEntries/);
  assert.match(component, /class="scripts-execution-detail"/);
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
  assert.match(
    main,
    /import '\.\/styles\/features\/scripts-explorer-redesign\.css';/,
  );
});
