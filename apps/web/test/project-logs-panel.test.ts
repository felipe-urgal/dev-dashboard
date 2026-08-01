import { afterEach, describe, expect, it } from 'vitest';

import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';

import type { ManagedProcess, ProcessLogSnapshot } from '@dev-dashboard/contracts';

import ProjectLogsPanel from '../src/components/ProjectLogsPanel.vue';
import { makeProject } from './support/activity-fixtures';

const requestId = '00f65a70-6cd9-44b4-832a-8b1fd8b898d6';
const slowRequestId = '11f65a70-6cd9-44b4-832a-8b1fd8b898d6';

const railsLog = [
  `[${requestId}] Started GET "/platform/observatorio/indicators/researches" for 127.0.0.1 at 2026-07-31 16:16:19 -0300`,
  `[${requestId}] Processing by Platform::Observatorio::Indicators::ResearchesController#index as JS`,
  `[${requestId}]   Parameters: {"sort_column"=>"", "site"=>"observatorio"}`,
  `[${requestId}]   Site Load (0.3ms)  SELECT \`sites\`.* FROM \`sites\` WHERE \`sites\`.\`slug\` = 'ancestralidades' LIMIT 1`,
  `[${requestId}]   Rendering platform/home/index.html.haml within layouts/platform`,
  `[${requestId}]   Rendered platform/home/index.html.haml (Duration: 10.0ms | GC: 0.3ms)`,
  `[${requestId}] Completed 200 OK in 142ms (Views: 117.3ms | ActiveRecord: 22.6ms (11 queries, 1 cached) | GC: 13.3ms)`,
  `[${slowRequestId}] Started GET "/platform/observatorio/indicators/researches/847/export" for 127.0.0.1 at 2026-07-31 16:15:45 -0300`,
  `[${slowRequestId}] Processing by Platform::Observatorio::Indicators::ExportsController#create as JSON`,
  `[${slowRequestId}]   Research Load (0.4ms)  SELECT \`sites\`.* FROM \`sites\` WHERE \`research_id\` = 1`,
  `[${slowRequestId}]   Research Load (0.4ms)  SELECT \`sites\`.* FROM \`sites\` WHERE \`research_id\` = 2`,
  `[${slowRequestId}]   Research Load (0.4ms)  SELECT \`sites\`.* FROM \`sites\` WHERE \`research_id\` = 3`,
  `[${slowRequestId}] Completed 500 Internal Server Error in 1840ms (ActiveRecord: 1210ms (58 queries, 0 cached) | GC: 230ms)`,
].join('\n');

function processLogSnapshot(content: string): ProcessLogSnapshot {
  return {
    projectId: 'p1',
    processId: 'proc-1',
    content,
    sizeBytes: content.length,
    truncated: false,
    masked: false,
    redactionCount: 0,
    readAt: '2026-07-31T19:16:20Z',
  };
}

function runningProcess(overrides: Partial<ManagedProcess> = {}): ManagedProcess {
  return {
    id: 'proc-1',
    projectId: 'p1',
    kind: 'server',
    status: 'running',
    pid: 4242,
    port: 3003,
    command: 'bin/rails s',
    startedAt: '2026-07-31T19:00:00Z',
    ...overrides,
  } as ManagedProcess;
}

async function mountPanel(logContent = railsLog) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname === '/api/projects/p1/process') {
      return new Response(JSON.stringify({ process: runningProcess() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/api/projects/p1/process/logs') {
      return new Response(
        JSON.stringify({ log: processLogSnapshot(logContent) }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const project = makeProject({ id: 'p1', type: 'rails', capabilities: ['server'] });
  const wrapper = mount(ProjectLogsPanel, {
    props: { project },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

  await flushPromises();
  await flushPromises();

  return { wrapper, restoreFetch: () => { globalThis.fetch = originalFetch; } };
}

describe('ProjectLogsPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mostra a requisição mais recente no topo da lista e a seleciona por padrão', async () => {
    const { wrapper, restoreFetch } = await mountPanel();

    try {
      const items = wrapper.findAll('.rails-list-item');
      expect(items.length).toBeGreaterThanOrEqual(2);
      expect(items[0]?.text()).toContain('/export');
      expect(items[0]?.classes()).toContain('selected');

      expect(wrapper.get('.rails-detail-heading h3').text()).toContain('/export');
      expect(wrapper.find('.project-logs-sidebar').exists()).toBe(false);
      expect(wrapper.get('.project-logs-topbar').text()).toContain('Status do servidor');
      expect(wrapper.get('.project-logs-topbar').text()).toContain('Ações rápidas');
      expect(wrapper.findAll('.project-log-quick-actions a')).toHaveLength(2);
    } finally {
      restoreFetch();
    }
  });

  it('agrupa SQL repetido, sinaliza N+1 e faz o parse dos parâmetros em árvore', async () => {
    const { wrapper, restoreFetch } = await mountPanel();

    try {
      expect(wrapper.get('.rails-n1-callout').text()).toContain('3×');
      expect(wrapper.find('.sql-tk-kw').exists()).toBe(true);

      await wrapper.findAll('.rails-list-item')[1]?.trigger('click');
      expect(wrapper.find('.ptree').exists()).toBe(true);
      expect(wrapper.text()).toContain('sort_column');
    } finally {
      restoreFetch();
    }
  });

  it('troca para o modo raw sem lançar erros e mostra as linhas mais recentes primeiro', async () => {
    const { wrapper, restoreFetch } = await mountPanel();

    try {
      const rawButton = wrapper.findAll('.project-log-view-switch button')[1];
      await rawButton?.trigger('click');

      const lines = wrapper.findAll('.project-log-line').map((line) => line.text());
      expect(lines.length).toBeGreaterThan(0);

      const exportIndex = lines.findIndex((text) => text.includes('/export'));
      const researchesIndex = lines.findIndex((text) => text.includes('"/platform/observatorio/indicators/researches"'));
      expect(exportIndex).toBeGreaterThanOrEqual(0);
      expect(researchesIndex).toBeGreaterThanOrEqual(0);
      expect(exportIndex).toBeLessThan(researchesIndex);
    } finally {
      restoreFetch();
    }
  });

  it('não trava com um log grande (milhares de linhas) e respeita o teto de itens renderizados', async () => {
    const manyRequests = Array.from({ length: 200 }, (_, index) => {
      const id = `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, '0')}`;
      return [
        `[${id}] Started GET "/health/${index}" for 127.0.0.1 at 2026-07-31 16:00:00 -0300`,
        `[${id}] Completed 200 OK in 1ms (ActiveRecord: 0.0ms (0 queries, 0 cached) | GC: 0.0ms)`,
      ].join('\n');
    }).join('\n');
    const bigLog = `${manyRequests}\n${railsLog}`;

    const { wrapper, restoreFetch } = await mountPanel(bigLog);

    try {
      const items = wrapper.findAll('.rails-list-item');
      expect(items.length).toBeLessThanOrEqual(151);
      expect(wrapper.find('.rails-load-more').exists()).toBe(true);
    } finally {
      restoreFetch();
    }
  });
});
