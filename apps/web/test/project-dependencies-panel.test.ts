import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectScriptCatalog } from '@dev-dashboard/contracts';

import ProjectDependenciesPanel from '../src/components/ProjectDependenciesPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

class FakeWebSocket {
  public static instances: FakeWebSocket[] = [];
  public readonly url: string;
  public readyState = 0;
  private readonly listeners = new Map<
    string,
    Array<(event: unknown) => void>
  >();

  public constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  public addEventListener(
    type: string,
    handler: (event: unknown) => void,
  ): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  public close(): void {
    this.readyState = 3;
    this.emit('close', {});
  }

  public emit(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  public emitMessage(payload: unknown): void {
    this.emit('message', { data: JSON.stringify(payload) });
  }
}

// @ts-expect-error substitui o WebSocket global só para este arquivo de teste
globalThis.WebSocket = FakeWebSocket;

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
  FakeWebSocket.instances = [];
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(
  catalog: ProjectScriptCatalog,
  options: { onStartCall?: (body: unknown) => void } = {},
): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path.endsWith('/dependencies/pty/status')) {
      return jsonResponse({ snapshot: null });
    }
    if (path.endsWith('/dependencies/pty/start')) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      options.onStartCall?.(body);
      const action = catalog.items.find((item) => item.id === body.actionId);
      return jsonResponse(
        {
          snapshot: {
            actionId: body.actionId,
            actionName: action?.name ?? body.actionId,
            status: 'running',
            exitCode: null,
            exitSignal: null,
            startedAt: new Date().toISOString(),
            endedAt: null,
          },
        },
        201,
      );
    }
    if (path.endsWith('/dependencies/pty/cancel')) {
      return jsonResponse({ ok: true });
    }
    if (path.endsWith('/scripts')) return jsonResponse({ catalog });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = originalFetch;
  };
}

test('mostra instalação e build do gerenciador Node detectado', async () => {
  installFetch({
    items: [
      {
        id: 'package-manager:install',
        name: 'Instalar dependências',
        description: 'Instala as dependências usando o lockfile do yarn.',
        command: 'yarn install',
        origin: 'package-manager',
        risk: 'mutable',
        enabled: true,
      },
      {
        id: 'package-script:build',
        name: 'build',
        description: 'Script declarado em scripts.build no package.json.',
        command: 'yarn build',
        origin: 'package-script',
        risk: 'mutable',
        enabled: true,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 2,
    totalPages: 1,
  });

  const wrapper = mount(ProjectDependenciesPanel, {
    props: {
      project: makeProject({ type: 'node', capabilities: ['scripts'] }),
    },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Node \/ Yarn/);
  assert.match(wrapper.text(), /Instalar dependências/);
  assert.match(wrapper.text(), /yarn install/);
  assert.match(wrapper.text(), /yarn build/);
  assert.equal(
    wrapper.get('.dependencies-panel').attributes('aria-busy'),
    'false',
  );
  assert.equal(
    wrapper.get('.dependencies-console').attributes('aria-label'),
    'Detalhes da execução',
  );
  assert.equal(wrapper.findAll('.dependencies-table tbody tr').length, 2);
  wrapper.unmount();
});

test('projeto Rails com frontend mostra Bundler e Node juntos', async () => {
  installFetch({
    items: [
      {
        id: 'bundler:check',
        name: 'Verificar gems',
        description: 'Confere as gems.',
        command: 'bundle check',
        origin: 'bundler',
        risk: 'read-only',
        enabled: true,
      },
      {
        id: 'bundler:install',
        name: 'Instalar gems',
        description: 'Instala gems.',
        command: 'bundle install',
        origin: 'bundler',
        risk: 'mutable',
        enabled: true,
      },
      {
        id: 'bundler:update',
        name: 'Atualizar gems',
        description: 'Atualiza gems.',
        command: 'bundle update',
        origin: 'bundler',
        risk: 'mutable',
        enabled: true,
      },
      {
        id: 'package-manager:install',
        name: 'Instalar dependências',
        description: 'Instala dependências Node.',
        command: 'npm install',
        origin: 'package-manager',
        risk: 'mutable',
        enabled: true,
      },
      {
        id: 'package-script:build',
        name: 'build',
        description: 'Gera o build.',
        command: 'npm run build',
        origin: 'package-script',
        risk: 'mutable',
        enabled: true,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 5,
    totalPages: 1,
  });

  const wrapper = mount(ProjectDependenciesPanel, {
    props: {
      project: makeProject({
        type: 'rails',
        capabilities: ['scripts', 'bundler'],
      }),
    },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Ruby \/ Bundler/);
  assert.match(wrapper.text(), /Node \/ npm/);
  assert.match(wrapper.text(), /bundle check/);
  assert.match(wrapper.text(), /bundle update/);
  assert.match(wrapper.text(), /npm run build/);
  assert.equal(wrapper.findAll('.dependencies-table tbody tr').length, 5);
  wrapper.unmount();
});

test('executa uma ação via PTY, mostra o terminal e conclui', async () => {
  const calls: unknown[] = [];
  installFetch(
    {
      items: [
        {
          id: 'package-manager:install',
          name: 'Instalar dependências',
          description: 'Instala as dependências usando o lockfile do npm.',
          command: 'npm install',
          origin: 'package-manager',
          risk: 'mutable',
          enabled: true,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    },
    { onStartCall: (body) => calls.push(body) },
  );

  const wrapper = mount(ProjectDependenciesPanel, {
    props: {
      project: makeProject({ type: 'node', capabilities: ['scripts'] }),
    },
  });
  await flushPromises();
  await flushPromises();

  const runButton = wrapper
    .findAll('.dependencies-table tbody button')
    .find((button) => button.text().includes('Executar'));
  assert.ok(runButton);
  await runButton!.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(calls, [{ actionId: 'package-manager:install' }]);
  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0]!;
  socket.readyState = 1;
  socket.emit('open', {});
  socket.emitMessage({
    type: 'ready',
    snapshot: {
      actionId: 'package-manager:install',
      actionName: 'Instalar dependências',
      status: 'running',
      exitCode: null,
      exitSignal: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      buffer: '',
    },
  });
  await flushPromises();
  assert.doesNotMatch(wrapper.text(), /Executando…/);

  socket.emitMessage({ type: 'output', data: 'added 12 packages\n' });
  await flushPromises();

  socket.emitMessage({ type: 'exit', exitCode: 0, exitSignal: null });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /concluído/);
});
