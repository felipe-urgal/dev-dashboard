import { afterEach, describe, expect, it } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  ManagedProcess,
  ProcessLogSnapshot,
} from '@dev-dashboard/contracts';

import ProjectLogsPanel from '../src/components/ProjectLogsPanel.vue';
import { makeProject } from './support/activity-fixtures';

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

function runningProcess(): ManagedProcess {
  return {
    id: 'proc-1',
    projectId: 'p1',
    kind: 'server',
    status: 'running',
    pid: 4242,
    port: 3003,
    command: 'npm run dev',
    startedAt: '2026-07-31T19:00:00Z',
  } as ManagedProcess;
}

async function mountPanel(content: string) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname === '/api/projects/p1/process') {
      return new Response(JSON.stringify({ process: runningProcess() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/api/projects/p1/process/logs/events') {
      const frame = `data: ${JSON.stringify(processLogSnapshot(content))}\n\n`;
      return new Response(frame, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ProjectLogsPanel, {
    props: {
      project: makeProject({
        id: 'p1',
        type: 'node',
        capabilities: ['server'],
      }),
    },
  });

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

  it('exibe somente o terminal do servidor', async () => {
    const { wrapper, restoreFetch } = await mountPanel(
      'Starting\nCompiled /dashboard\nGET / 200 in 857ms',
    );

    try {
      expect(wrapper.find('.project-log-terminal').exists()).toBe(true);
      expect(wrapper.find('.project-log-terminal-only').exists()).toBe(true);
      expect(wrapper.find('.stream-toggle-button').exists()).toBe(false);
      expect(wrapper.find('.project-log-runtime-strip').exists()).toBe(false);
      expect(wrapper.find('.project-log-view-switch').exists()).toBe(false);
      expect(wrapper.find('.project-log-overflow').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      restoreFetch();
    }
  });
});
