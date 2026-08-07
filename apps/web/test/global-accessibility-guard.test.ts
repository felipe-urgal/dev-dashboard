import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(testDirectory, '../../..');

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(rootDirectory, relativePath), 'utf8');
}

test('landmarks principais mantêm nomes acessíveis', async () => {
  const pages = [
    {
      path: 'apps/web/src/views/DashboardView.vue',
      headingId: 'overview-title',
    },
    {
      path: 'apps/web/src/views/ActivityView.template.html',
      headingId: 'activity-title',
    },
    {
      path: 'apps/web/src/views/ProcessesView.vue',
      headingId: 'processes-title',
    },
    {
      path: 'apps/web/src/views/SettingsView.vue',
      headingId: 'settings-title',
    },
  ];

  for (const page of pages) {
    const content = await source(page.path);
    assert.match(
      content,
      new RegExp(`aria-labelledby="${page.headingId}"`),
      `${page.path} deve nomear seu landmark principal.`,
    );
    assert.match(
      content,
      new RegExp(`<h[1-6][^>]*id="${page.headingId}"`),
      `${page.path} deve conter o título referenciado.`,
    );
  }
});

test('resultados, refresh e tabelas mantêm anúncios e nomes acessíveis', async () => {
  const dashboard = await source('apps/web/src/views/DashboardView.vue');
  assert.match(dashboard, /class="project-filter-menu"/);
  assert.match(
    dashboard,
    /class="project-filter-popover"\s+role="menu"/,
  );
  assert.match(dashboard, /role="menuitemradio"/);
  assert.match(dashboard, /hasActiveProjectFilters[\s\S]*role="status"/);
  assert.match(dashboard, /class="alert alert-warning"[\s\S]*role="status"/);

  const activity = await source(
    'apps/web/src/views/ActivityView.template.html',
  );
  assert.match(activity, /loading && hasItems[\s\S]*Atualizando atividades/);
  assert.match(activity, /class="activity-empty"\s+role="status"/);
  assert.match(
    activity,
    /<caption class="sr-only">[\s\S]*Histórico de atividades/,
  );

  const processes = await source('apps/web/src/views/ProcessesView.vue');
  assert.match(
    processes,
    /loading && items\.length > 0[\s\S]*Atualizando processos/,
  );
  assert.match(
    processes,
    /<caption class="sr-only">[\s\S]*Processos gerenciados/,
  );
  assert.match(processes, /class="activity-empty"\s+role="status"/);
});

test('ações somente com ícone mantêm nomes acessíveis', async () => {
  const files = [
    'apps/web/src/components/AppSidebar.vue',
    'apps/web/src/components/ProjectHeader.vue',
    'apps/web/src/components/ProjectCard.vue',
    'apps/web/src/views/DashboardView.vue',
    'apps/web/src/views/ProcessesView.vue',
    'apps/web/src/views/SettingsView.vue',
  ];

  for (const file of files) {
    const content = await source(file);
    const buttons = content.matchAll(/<button\b([\s\S]*?)>/g);

    for (const match of buttons) {
      const attributes = match[1] ?? '';
      const isIconOnly =
        /class="[^"]*(?:icon-button|sidebar-icon-button|compact-action-button)[^"]*"/.test(
          attributes,
        );

      if (!isIconOnly) continue;

      assert.match(
        attributes,
        /(?:aria-label|title)=/,
        `${file} contém botão somente com ícone sem nome acessível: ${match[0]}`,
      );
    }
  }
});

test('inputs e selects possuem label associado ou nome acessível', async () => {
  const files = [
    'apps/web/src/components/AppSidebar.vue',
    'apps/web/src/components/ProjectHeader.vue',
    'apps/web/src/views/DashboardView.vue',
    'apps/web/src/views/ProcessesView.vue',
    'apps/web/src/views/SettingsView.vue',
  ];

  for (const file of files) {
    const content = await source(file);
    const controls = content.matchAll(/<(input|select)\b([\s\S]*?)>/g);

    for (const match of controls) {
      const tag = match[1];
      const attributes = match[2] ?? '';
      const id = attributes.match(/\bid="([^"]+)"/)?.[1];
      const hasDirectName = /\b(?:aria-label|aria-labelledby)=/.test(attributes);
      const hasLabel = id
        ? new RegExp(`<label[^>]*for="${id}"`).test(content)
        : false;

      assert.ok(
        hasDirectName || hasLabel,
        `${file} contém <${tag}> sem nome acessível: ${match[0]}`,
      );
    }
  }
});
