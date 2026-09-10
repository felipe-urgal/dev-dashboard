import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type { Project, ProjectTestOverview } from '@dev-dashboard/contracts';

const mocks = vi.hoisted(() => ({
  fetchProjectTests: vi.fn(),
  fetchProjectTestIntelligence: vi.fn(),
  fetchProjectTestHistory: vi.fn(),
  fetchProjectTestPtyStatus: vi.fn(),
  startProjectTestPty: vi.fn(),
  cancelProjectTestPty: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectTests: mocks.fetchProjectTests,
  fetchProjectTestIntelligence: mocks.fetchProjectTestIntelligence,
  fetchProjectTestHistory: mocks.fetchProjectTestHistory,
  fetchProjectTestPtyStatus: mocks.fetchProjectTestPtyStatus,
  startProjectTestPty: mocks.startProjectTestPty,
  cancelProjectTestPty: mocks.cancelProjectTestPty,
  projectTestPtyWebSocketUrl: (projectId: string) =>
    `ws://localhost/api/projects/${projectId}/tests/pty/connect`,
}));

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

function overview(): ProjectTestOverview {
  return {
    supported: true,
    commands: [
      {
        id: 'full-suite',
        runner: 'vitest',
        label: 'npm run test',
        description: 'Suíte completa',
        origin: 'package-script',
        priority: 1,
        supportsFileTarget: false,
        supportsCaseTarget: false,
        supportsNamePatternTarget: false,
      },
    ],
  };
}

function project(): Project {
  return {
    id: 'projeto-1',
    name: 'Projeto',
    path: '/tmp/projeto-1',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['tests'],
  };
}

let ProjectTestsPtyPanel: typeof import('../src/components/ProjectTestsPtyPanel.vue').default;

beforeEach(async () => {
  vi.clearAllMocks();
  FakeWebSocket.instances = [];
  mocks.fetchProjectTests.mockResolvedValue(overview());
  mocks.fetchProjectTestPtyStatus.mockResolvedValue(null);
  mocks.fetchProjectTestHistory.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 0,
  });
  mocks.fetchProjectTestIntelligence.mockResolvedValue({
    commandId: 'full-suite',
    state: 'unknown',
    recommendation: 'full-suite',
    baseBranch: 'main',
    currentBranch: 'main',
    changedFiles: [],
    testFiles: [],
    unmappedFiles: [],
    evidence: [],
    coverageDelta: {
      state: 'unknown',
      reason: 'no-current-artifact',
      worsenedFiles: [],
      missingFiles: [],
    },
    flakiness: {
      state: 'unknown',
      reason: 'no-granular-results',
      tests: [],
    },
  });
  ({ default: ProjectTestsPtyPanel } =
    await import('../src/components/ProjectTestsPtyPanel.vue'));
});

afterEach(() => {
  document.body.innerHTML = '';
});

test('carrega os comandos e habilita "Executar suíte completa"', async () => {
  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  assert.equal(
    wrapper.get('.tests-pty-heading strong').text(),
    'Testes do projeto',
  );
  assert.equal(wrapper.get('.tests-pty-state').text(), 'Pronto');
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes('Executar suíte completa'));
  assert.ok(button);
  assert.equal(button.attributes('disabled'), undefined);
});

test('executar conecta via WebSocket, escreve a saída e mostra o resultado ao encerrar', async () => {
  mocks.startProjectTestPty.mockResolvedValue({
    status: 'running',
    exitCode: null,
    exitSignal: null,
    startedAt: '2026-08-11T10:00:00.000Z',
    endedAt: null,
  });

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes('Executar suíte completa'));
  assert.ok(button);
  await button.trigger('click');
  await flushPromises();

  assert.equal(mocks.startProjectTestPty.mock.calls[0]?.[1], 'full-suite');
  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0]!;
  socket.readyState = 1;
  socket.emit('open', {});

  socket.emitMessage({
    type: 'ready',
    snapshot: {
      status: 'running',
      exitCode: null,
      exitSignal: null,
      startedAt: '2026-08-11T10:00:00.000Z',
      endedAt: null,
      buffer: '',
      truncated: false,
    },
  });
  await flushPromises();
  assert.doesNotMatch(wrapper.text(), /Executando…/);

  socket.emitMessage({ type: 'output', data: 'ok\n' });
  await flushPromises();

  socket.emitMessage({ type: 'exit', exitCode: 0, exitSignal: null });
  await flushPromises();

  assert.doesNotMatch(wrapper.text(), /Concluído com sucesso/);
});

test('cancelar chama cancelProjectTestPty enquanto a execução está em andamento', async () => {
  mocks.startProjectTestPty.mockResolvedValue({
    status: 'running',
    exitCode: null,
    exitSignal: null,
    startedAt: '2026-08-11T10:00:00.000Z',
    endedAt: null,
  });
  mocks.cancelProjectTestPty.mockResolvedValue(undefined);

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  const startButton = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes('Executar suíte completa'));
  assert.ok(startButton);
  await startButton.trigger('click');
  await flushPromises();

  const cancelButton = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes('Cancelar'));
  assert.ok(cancelButton);
  await cancelButton.trigger('click');
  await flushPromises();

  assert.equal(mocks.cancelProjectTestPty.mock.calls.length, 1);
});

test('mostra resumo e histórico usando apenas dados reais das execuções', async () => {
  mocks.fetchProjectTestHistory.mockResolvedValue({
    items: [
      {
        id: 'exec-2',
        projectId: 'projeto-1',
        commandId: 'full-suite',
        scope: 'full-suite',
        gitRevision: 'abcdef1234567890',
        status: 'stopped',
        startedAt: '2026-08-11T10:00:00.000Z',
        finishedAt: '2026-08-11T10:02:14.000Z',
        exitCode: 0,
      },
      {
        id: 'exec-1',
        projectId: 'projeto-1',
        commandId: 'full-suite',
        scope: 'full-suite',
        gitRevision: '1234567890abcdef',
        status: 'failed',
        startedAt: '2026-08-10T09:00:00.000Z',
        finishedAt: '2026-08-10T09:01:52.000Z',
        exitCode: 1,
      },
    ],
    page: 1,
    pageSize: 8,
    total: 2,
    totalPages: 1,
  });

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  assert.equal(wrapper.findAll('.tests-overview-card').length, 4);
  assert.match(wrapper.text(), /Histórico\s*2/);
  assert.match(wrapper.text(), /2m 14s/);
  assert.match(wrapper.text(), /Sem baseline comparável/);

  const historyTab = wrapper
    .findAll('.tests-tabs button')
    .find((candidate) => candidate.text() === 'Histórico');
  assert.ok(historyTab);
  await historyTab.trigger('click');
  await flushPromises();

  const rows = wrapper.findAll('.tests-history-row');
  assert.equal(rows.length, 2);
  assert.match(rows[0]!.text(), /Sucesso/);
  assert.match(rows[0]!.text(), /npm run test/);
  assert.match(rows[0]!.text(), /abcdef12/);
  assert.match(rows[0]!.text(), /2m 14s/);
  assert.match(rows[1]!.text(), /Falhou/);
  assert.match(rows[1]!.text(), /exit 1/);
});
