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

function managerFromCatalog(catalog: ProjectScriptCatalog) {
  const command =
    catalog.items.find((item) => item.origin === 'package-manager')?.command ??
    '';
  if (command.startsWith('yarn ')) return 'yarn';
  if (command.startsWith('pnpm ')) return 'pnpm';
  if (command.startsWith('bun ')) return 'bun';
  return 'npm';
}

function healthResponse(catalog: ProjectScriptCatalog) {
  const manager = managerFromCatalog(catalog);
  return {
    generatedAt: '2026-10-02T10:00:00.000Z',
    inventory: {
      status: 'ready',
      projectId: 'projeto-1',
      packageManager: manager,
      observedAt: '2026-10-02T10:00:00.000Z',
      lockfile: 'present',
      lockfileName:
        manager === 'yarn'
          ? 'yarn.lock'
          : manager === 'pnpm'
            ? 'pnpm-lock.yaml'
            : manager === 'bun'
              ? 'bun.lock'
              : 'package-lock.json',
      dependencies: [
        {
          name: 'fastify',
          kind: 'dependency',
          declaredRange: '^5.0.0',
          resolution: 'resolved',
          resolvedVersion: '5.6.0',
        },
      ],
      warnings: [],
    },
    runtime: {
      state: 'declared',
      observedAt: '2026-10-02T10:00:00.000Z',
      declarations: [
        {
          source: '.node-version',
          raw: '22.12.0',
          version: '22.12.0',
        },
      ],
      version: '22.12.0',
    },
    metadata: [
      {
        name: 'fastify',
        state: 'available',
        source: 'npm-registry',
        observedAt: '2026-10-02T10:00:00.000Z',
        latestVersion: '5.6.0',
        runtimeVersion: '22.12.0',
        latestRuntimeCompatibility: 'compatible',
        update: 'none',
      },
    ],
    advisories: [
      {
        name: 'fastify',
        state: 'available',
        source: 'osv',
        observedAt: '2026-10-02T10:00:00.000Z',
        resolvedVersion: '5.6.0',
        advisories: [],
        complete: true,
      },
    ],
  };
}

function installFetch(
  catalog: ProjectScriptCatalog,
  options: {
    onStartCall?: (body: unknown) => void;
    onHealthCall?: (url: URL) => void;
  } = {},
): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const requestPath = url.pathname;

    if (requestPath.endsWith('/dependencies/pty/status')) {
      return jsonResponse({ snapshot: null });
    }
    if (requestPath.endsWith('/dependencies/pty/confirmation')) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return jsonResponse(
        {
          confirmation: {
            token: 'a'.repeat(64),
            actionId: body.actionId,
            environmentInstanceId: 'environment:primary:projeto-1',
            expiresAt: '2026-10-02T10:01:00.000Z',
          },
        },
        201,
      );
    }
    if (requestPath.endsWith('/dependencies/pty/start')) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      options.onStartCall?.(body);
      const action = catalog.items.find((item) => item.id === body.actionId);
      return jsonResponse(
        {
          snapshot: {
            actionId: body.actionId,
            actionName: action?.name ?? body.actionId,
            environmentInstanceId: 'environment:primary:projeto-1',
            risk: action?.risk ?? 'mutable',
            cancelled: false,
            truncated: false,
            status: 'running',
            exitCode: null,
            exitSignal: null,
            startedAt: '2026-10-02T10:00:00.000Z',
            endedAt: null,
          },
        },
        201,
      );
    }
    if (requestPath.endsWith('/dependencies/pty/cancel')) {
      return jsonResponse({ ok: true });
    }
    if (requestPath.endsWith('/dependency-health')) {
      options.onHealthCall?.(url);
      return jsonResponse({ health: healthResponse(catalog) });
    }
    if (requestPath.endsWith('/dependency-upgrade-plan')) {
      return jsonResponse({
        plan: {
          generatedAt: '2026-10-02T10:00:00.000Z',
          projectId: 'projeto-1',
          packageManager: managerFromCatalog(catalog),
          status: 'ready',
          items: [],
          groups: [],
          warnings: [],
        },
      });
    }
    if (requestPath.endsWith('/bundler')) {
      return jsonResponse({
        bundler: {
          supported: true,
          check: {
            satisfied: true,
            message: "The Gemfile's dependencies are satisfied",
          },
          outdated: [
            {
              name: 'puma',
              installed: '6.4.0',
              newest: '6.4.2',
              requested: '~> 6.4',
            },
          ],
        },
      });
    }
    if (requestPath.endsWith('/scripts')) return jsonResponse({ catalog });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = originalFetch;
  };
}

function runningSnapshot(actionId = 'package-manager:install') {
  return {
    actionId,
    actionName: 'Instalar dependências',
    environmentInstanceId: 'environment:primary:projeto-1',
    risk: 'mutable',
    cancelled: false,
    truncated: false,
    status: 'running',
    exitCode: null,
    exitSignal: null,
    startedAt: '2026-10-02T10:00:00.000Z',
    endedAt: null,
    buffer: '',
  };
}

const nodeCatalog: ProjectScriptCatalog = {
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
};

test('mantém runner terminal-first e mostra health compacto do manager real', async () => {
  installFetch(nodeCatalog);

  const wrapper = mount(ProjectDependenciesPanel, {
    props: {
      project: makeProject({ type: 'node', capabilities: ['scripts'] }),
    },
  });
  await flushPromises();
  await flushPromises();

  assert.match(wrapper.text(), /Node \/ Yarn/);
  assert.match(wrapper.text(), /1 deps/);
  assert.match(wrapper.text(), /0 updates/);
  assert.match(wrapper.text(), /0 advisories/);
  assert.match(wrapper.text(), /Node 22.12.0/);
  assert.match(wrapper.text(), /yarn install/);
  assert.match(wrapper.text(), /yarn build/);
  assert.match(wrapper.text(), /Console/);
  assert.match(wrapper.text(), /Pronto para executar/);
  assert.equal(wrapper.find('.dependencies-workspace').exists(), true);
  assert.equal(wrapper.find('.dependencies-health-strip').exists(), true);
  assert.equal(wrapper.findAll('.dependencies-action-row').length, 2);
  wrapper.unmount();
});

test('Rails híbrido combina Health Node com inspeção Bundler', async () => {
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
    ],
    page: 1,
    pageSize: 100,
    total: 3,
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

  assert.match(wrapper.text(), /Node \/ npm/);
  assert.match(wrapper.text(), /Ruby \/ Bundler/);
  assert.match(wrapper.text(), /1 updates/);
  assert.match(wrapper.text(), /bundle update/);
  assert.match(wrapper.text(), /Pode alterar o Gemfile.lock/);
  assert.equal(wrapper.findAll('.dependencies-group').length, 2);
  wrapper.unmount();
});

test('ação mutável solicita confirmação backend antes de iniciar o PTY', async () => {
  const calls: unknown[] = [];
  installFetch(nodeCatalog, { onStartCall: (body) => calls.push(body) });

  const wrapper = mount(ProjectDependenciesPanel, {
    props: {
      project: makeProject({ type: 'node', capabilities: ['scripts'] }),
    },
  });
  await flushPromises();
  await flushPromises();

  await wrapper.get('.dependencies-run-command').trigger('click');
  await flushPromises();
  await flushPromises();

  assert.deepEqual(calls, [
    {
      actionId: 'package-manager:install',
      confirmationToken: 'a'.repeat(64),
    },
  ]);
  assert.equal(FakeWebSocket.instances.length, 1);

  const socket = FakeWebSocket.instances[0]!;
  socket.readyState = 1;
  socket.emit('open', {});
  socket.emitMessage({ type: 'ready', snapshot: runningSnapshot() });
  await flushPromises();

  assert.match(wrapper.text(), /Executando/);
  socket.emitMessage({
    type: 'exit',
    exitCode: 0,
    exitSignal: null,
    snapshot: {
      ...runningSnapshot(),
      status: 'exited',
      endedAt: '2026-10-02T10:00:01.500Z',
      exitCode: 0,
    },
  });
  await flushPromises();

  assert.match(wrapper.text(), /Sucesso/);
  assert.match(wrapper.text(), /1.5s/);
  assert.match(wrapper.text(), /exit 0/);
  wrapper.unmount();
});

test('cancelamento e queda de conexão são estados distintos de falha', async () => {
  installFetch(nodeCatalog);

  const wrapper = mount(ProjectDependenciesPanel, {
    props: {
      project: makeProject({ type: 'node', capabilities: ['scripts'] }),
    },
  });
  await flushPromises();
  await flushPromises();

  await wrapper.get('.dependencies-run-command').trigger('click');
  await flushPromises();
  const socket = FakeWebSocket.instances[0]!;
  socket.readyState = 1;
  socket.emit('open', {});
  socket.emitMessage({ type: 'ready', snapshot: runningSnapshot() });
  await flushPromises();

  socket.emit('close', {});
  await flushPromises();
  assert.match(wrapper.text(), /Conexão perdida/);
  assert.match(wrapper.text(), /execução continua ativa/i);

  const reconnect = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Reconectar');
  assert.ok(reconnect);
  await reconnect.trigger('click');
  await flushPromises();
  assert.equal(FakeWebSocket.instances.length, 2);

  const reconnected = FakeWebSocket.instances[1]!;
  reconnected.readyState = 1;
  reconnected.emit('open', {});
  reconnected.emitMessage({ type: 'ready', snapshot: runningSnapshot() });
  await flushPromises();

  const cancel = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Cancelar');
  assert.ok(cancel);
  await cancel.trigger('click');
  reconnected.emitMessage({
    type: 'exit',
    exitCode: 143,
    exitSignal: 15,
    snapshot: {
      ...runningSnapshot(),
      status: 'exited',
      cancelled: true,
      exitCode: 143,
      exitSignal: 15,
      endedAt: '2026-10-02T10:00:01.000Z',
    },
  });
  await flushPromises();

  assert.match(wrapper.text(), /Cancelado/);
  assert.doesNotMatch(wrapper.text(), /Falhou/);
  wrapper.unmount();
});

test('Atualizar saúde solicita refresh explícito sem bloquear o runner', async () => {
  const calls: URL[] = [];
  installFetch(nodeCatalog, { onHealthCall: (url) => calls.push(url) });

  const wrapper = mount(ProjectDependenciesPanel, {
    props: {
      project: makeProject({ type: 'node', capabilities: ['scripts'] }),
    },
  });
  await flushPromises();
  await flushPromises();

  const refresh = wrapper
    .findAll('button')
    .find((button) => button.text() === 'Atualizar saúde');
  assert.ok(refresh);
  await refresh.trigger('click');
  await flushPromises();
  await flushPromises();

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.searchParams.get('refresh'), null);
  assert.equal(calls[1]?.searchParams.get('refresh'), 'true');
  assert.equal(
    wrapper.find('.dependencies-run-command').attributes('disabled'),
    undefined,
  );
  wrapper.unmount();
});
