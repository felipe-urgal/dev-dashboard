import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'vitest';

async function resolveRepositoryRoot(): Promise<string> {
  const candidates = [process.cwd(), path.resolve(process.cwd(), '../..')];

  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, 'apps/web/src'));
      return candidate;
    } catch {
      // Tenta a raiz compatível com a execução pelo workspace ou monorepo.
    }
  }

  throw new Error(
    `Raiz do repositório não encontrada a partir de ${process.cwd()}.`,
  );
}

async function source(relativePath: string): Promise<string> {
  const root = await resolveRepositoryRoot();
  return readFile(path.join(root, relativePath), 'utf8');
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace('#', '');
  assert.equal(normalized.length, 6, `Cor hexadecimal inválida: ${value}`);
  return [0, 2, 4].map(
    (index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255,
  ) as [number, number, number];
}

function linearChannel(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(value: string): number {
  const [red, green, blue] = hexToRgb(value);
  return (
    0.2126 * linearChannel(red) +
    0.7152 * linearChannel(green) +
    0.0722 * linearChannel(blue)
  );
}

function contrastRatio(first: string, second: string): number {
  const luminances = [relativeLuminance(first), relativeLuminance(second)].sort(
    (left, right) => right - left,
  );

  return ((luminances[0] ?? 0) + 0.05) / ((luminances[1] ?? 0) + 0.05);
}

function cssToken(block: string, token: string): string {
  const match = block.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match?.[1], `Token ${token} não encontrado.`);
  return match[1];
}

test('páginas globais possuem landmark nomeado pelo título visível', async () => {
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
  assert.match(dashboard, /class="project-type-filters"\s+role="group"/);
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

  const settings = await source('apps/web/src/views/SettingsView.vue');
  assert.match(
    settings,
    /aria-label="Configurações de notificações e retenção"/,
  );
  for (const input of [
    'native-notifications',
    'retention-days',
    'script-history-limit',
    'test-history-limit',
  ]) {
    assert.match(
      settings,
      new RegExp(`aria-labelledby="${input}-label"`),
      `${input} deve possuir nome acessível explícito.`,
    );
    assert.match(
      settings,
      new RegExp(
        `aria-describedby="${input}-description ${input}-(?:status|limits)"`,
      ),
      `${input} deve possuir descrição e limites/estado associados.`,
    );
  }
});

test('tokens de texto do tema claro mantêm contraste AA nas superfícies', async () => {
  const tokens = await source('apps/web/src/styles/tokens.css');
  const lightTheme = tokens.match(
    /\[data-theme='light'\]\s*\{([\s\S]*)\}\s*$/,
  )?.[1];
  assert.ok(lightTheme, 'Bloco do tema claro não encontrado.');

  const foregrounds = ['--text', '--text-muted', '--text-dim'];
  const backgrounds = ['--surface-0', '--surface-1', '--surface-2'];

  for (const foregroundToken of foregrounds) {
    const foreground = cssToken(lightTheme, foregroundToken);
    for (const backgroundToken of backgrounds) {
      const background = cssToken(lightTheme, backgroundToken);
      const ratio = contrastRatio(foreground, background);
      assert.ok(
        ratio >= 4.5,
        `${foregroundToken} sobre ${backgroundToken} tem contraste ${ratio.toFixed(2)}:1.`,
      );
    }
  }
});
