import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { mount, RouterLinkStub, flushPromises } from '@vue/test-utils';

import type {
  ActivityList,
  Project,
  Workspace,
} from '@dev-dashboard/contracts';

import ActivityView from '../src/views/ActivityView.vue';
import { ApiRequestError } from '../src/api';
import {
  makeActivityList,
  makeProject,
  makeScriptActivity,
  makeServerActivity,
  makeWorkspace,
} from './support/activity-fixtures.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

interface MountArgs {
  workspaces?: () => Promise<Workspace[]>;
  projects?: () => Promise<Project[]>;
  activities: () => Promise<ActivityList>;
}

async function mountView(args: MountArgs) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/workspaces') {
      const workspaces = await (
        args.workspaces ?? (async () => [makeWorkspace()])
      )();
      return new Response(JSON.stringify({ workspaces }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/projects') {
      const projects = await (args.projects ?? (async () => [makeProject()]))();
      return new Response(JSON.stringify({ projects }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/activities') {
      try {
        const activities = await args.activities();
        return new Response(JSON.stringify({ activities }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      } catch (error) {
        if (error instanceof ApiRequestError) {
          return new Response(
            JSON.stringify({ error: error.code, message: error.message }),
            {
              status: error.status,
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        throw error;
      }
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  const wrapper = mount(ActivityView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  return {
    wrapper,
    restore: () => {
      wrapper.unmount();
      globalThis.fetch = originalFetch;
    },
  };
}

let cleanup: (() => void) | undefined;
beforeEach(() => {
  cleanup = undefined;
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

test('mostra estado de carregamento enquanto a lista de atividades está pendente', async () => {
  vi.useFakeTimers();
  const pending = deferred<ActivityList>();
  const { wrapper, restore } = await mountView({
    activities: () => pending.promise,
  });
  cleanup = restore;

  await flushPromises();
  assert.equal(wrapper.get('#activity').attributes('aria-busy'), 'true');
  assert.match(wrapper.get('[role="status"]').text(), /Carregando atividades/);
  assert.equal(wrapper.find('.loading-skeleton-list').exists(), false);

  await vi.advanceTimersByTimeAsync(150);
  assert.equal(wrapper.findAll('.loading-skeleton-row').length, 5);

  pending.resolve(makeActivityList([]));
  await flushPromises();
  assert.equal(wrapper.get('#activity').attributes('aria-busy'), 'false');
  assert.equal(wrapper.find('.loading-skeleton').exists(), false);
});

test('mostra estado vazio quando não há atividades e nenhuma falha ocorreu', async () => {
  const { wrapper, restore } = await mountView({
    activities: async () => makeActivityList([]),
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Nenhuma atividade encontrada/);
});

test('preserva atividades válidas durante uma atualização manual', async () => {
  const pending = deferred<ActivityList>();
  let calls = 0;
  const { wrapper, restore } = await mountView({
    activities: () => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(
            makeActivityList([
              makeScriptActivity({ label: 'Execução preservada' }),
            ]),
          )
        : pending.promise;
    },
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  await wrapper.get('.activity-refresh-button').trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /Execução preservada/);
  assert.equal(wrapper.get('#activity').attributes('aria-busy'), 'true');
  assert.equal(wrapper.find('.loading-skeleton').exists(), false);

  pending.resolve(makeActivityList([]));
  await flushPromises();
});

test('renderiza as atividades recebidas com origem e estado formatados', async () => {
  const { wrapper, restore } = await mountView({
    activities: async () =>
      makeActivityList([
        makeScriptActivity({ label: 'Rodar migração', status: 'failed' }),
        makeServerActivity({ label: 'Servidor local', status: 'running' }),
      ]),
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  const text = wrapper.text();
  assert.match(text, /Rodar migração/);
  assert.match(text, /Servidor local/);
  assert.match(text, /Falhou/);
  assert.match(text, /Em execução/);
  assert.equal(wrapper.findAll('.activity-item').length, 2);

  const origins = wrapper
    .findAll('.activity-item-origin')
    .map((node) => node.text());
  assert.deepEqual(origins, ['Catálogo', 'Servidor']);
  const summary = wrapper
    .findAll('.activity-summary dd')
    .map((node) => node.text());
  assert.deepEqual(summary, ['1', '0', '1', '2']);
  assert.match(wrapper.find('.activity-project-cell').text(), /sample-node/);
  assert.match(
    wrapper.find('.activity-project-cell').text(),
    /Workspace principal/,
  );
  assert.equal(wrapper.findAll('.activity-open-button').length, 2);
});

test('mostra a mensagem de erro quando o carregamento das atividades falha', async () => {
  const { wrapper, restore } = await mountView({
    activities: async () => {
      throw new ApiRequestError({
        status: 500,
        message: 'A API está fora do ar.',
      });
    },
  });
  cleanup = restore;
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /A API está fora do ar/);
  assert.equal(wrapper.findAll('.activity-item').length, 0);
});
