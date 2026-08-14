import { afterEach, describe, expect, it } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
} from '@dev-dashboard/contracts';

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

function runningProcess(
  overrides: Partial<ManagedProcess> = {},
): ManagedProcess {
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

async function mountPanel(
  logContent = railsLog,
  type: 'rails' | 'node' = 'rails',
) {
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

    if (url.pathname === '/api/projects/p1/process/logs/events') {
      const frame = `data: ${JSON.stringify(processLogSnapshot(logContent))}\n\n`;
      return new Response(frame, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const project = makeProject({
    id: 'p1',
    type,
    capabilities: ['server'],
  });
  const wrapper = mount(ProjectLogsPanel, { props: { project } });

  await flushPromises();
  await flushPromises();

  return {
    wrapper,
    restoreFetch: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

describe('ProjectLogsPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('abre em Fluxo com uma linha por requisição e o mais recente embaixo', async () => {
    const { wrapper, restoreFetch } = await mountPanel();

    try {
      const modes = wrapper.findAll('.project-log-view-switch button');
      expect(modes[0]?.text()).toContain('Fluxo');
      expect(modes[0]?.classes()).toContain('active');
      expect(modes[1]?.text()).toContain('Diagnóstico');

      const events = wrapper
        .findAll('.project-log-flow .project-log-event')
        .map((event) => event.text());
      expect(events).toHaveLength(2);

      const researchesIndex = events.findIndex((text) =>
        text.includes('/platform/observatorio/indicators/researches'),
      );
      const exportIndex = events.findIndex((text) => text.includes('/export'));
      expect(researchesIndex).toBeGreaterThanOrEqual(0);
      expect(exportIndex).toBeGreaterThan(researchesIndex);
      expect(wrapper.text()).toContain('mais recente embaixo');
    } finally {
      wrapper.unmount();
      restoreFetch();
    }
  });

  it('mantém os detalhes recolhidos até a pessoa selecionar uma requisição', async () => {
    const { wrapper, restoreFetch } = await mountPanel();

    try {
      expect(wrapper.find('.project-log-event-detail').exists()).toBe(false);

      const event = wrapper
        .findAll('.project-log-event')
        .find((item) => item.text().includes('/export'));
      await event?.trigger('click');

      const detail = wrapper.get('.project-log-event-detail');
      expect(detail.text()).toContain('ExportsController#create');
      expect(detail.text()).toContain('Consulta SQL');
      expect(
        detail
          .findAll('.project-log-event-disclosure')
          .every((section) => section.attributes('open') === undefined),
      ).toBe(true);
    } finally {
      wrapper.unmount();
      restoreFetch();
    }
  });

  it('leva erros, requests lentas e N+1 para o Diagnóstico antes dos detalhes', async () => {
    const { wrapper, restoreFetch } = await mountPanel();

    try {
      const diagnosticButton = wrapper.findAll(
        '.project-log-view-switch button',
      )[1];
      await diagnosticButton?.trigger('click');

      const diagnostic = wrapper.get('.server-diagnostic');
      expect(diagnostic.text()).toContain('Erros');
      expect(diagnostic.text()).toContain('Requests lentas');
      expect(diagnostic.text()).toContain('Possível N+1');
      expect(diagnostic.text()).toContain('/export');
      expect(diagnostic.text()).toContain('3×');
      expect(wrapper.get('.server-investigation-callout').text()).toContain(
        'O que chamou atenção',
      );
      expect(wrapper.get('.rails-n1-callout').text()).toContain('3×');

      const detailSections = wrapper.findAll(
        'details.server-investigation-details',
      );
      expect(detailSections.length).toBeGreaterThan(0);
      expect(
        detailSections.every(
          (details) => details.attributes('open') === undefined,
        ),
      ).toBe(true);
    } finally {
      wrapper.unmount();
      restoreFetch();
    }
  });

  it('abre logs Node sem estrutura Rails em terminal somente leitura', async () => {
    const nodeLog = [
      'Starting',
      'Compiling /dashboard',
      'Compiled /dashboard in 3.2s',
      'ERROR Module not found: ./missing',
    ].join('\n');
    const { wrapper, restoreFetch } = await mountPanel(nodeLog, 'node');

    try {
      expect(wrapper.find('.project-log-view-switch').exists()).toBe(false);
      expect(wrapper.find('.project-log-terminal').exists()).toBe(true);
      expect(wrapper.get('.project-log-terminal').text()).toContain(
        'Terminal do servidor',
      );
      expect(wrapper.get('.project-log-terminal-body').attributes('tabindex')).toBe(
        undefined,
      );
    } finally {
      wrapper.unmount();
      restoreFetch();
    }
  });

  it('limita a renderização do fluxo grande e permite carregar eventos antigos', async () => {
    const manyRequests = Array.from({ length: 900 }, (_, index) => {
      const id = `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, '0')}`;
      return [
        `[${id}] Started GET "/health/${index}" for 127.0.0.1 at 2026-07-31 16:00:00 -0300`,
        `[${id}] Completed 200 OK in 1ms (ActiveRecord: 0.0ms (0 queries, 0 cached) | GC: 0.0ms)`,
      ].join('\n');
    }).join('\n');
    const bigLog = `${manyRequests}\n${railsLog}`;

    const { wrapper, restoreFetch } = await mountPanel(bigLog);

    try {
      const events = wrapper.findAll('.project-log-flow .project-log-event');
      expect(events.length).toBeLessThanOrEqual(500);
      expect(wrapper.find('.project-log-flow .rails-load-more').exists()).toBe(
        true,
      );
    } finally {
      wrapper.unmount();
      restoreFetch();
    }
  });
});
