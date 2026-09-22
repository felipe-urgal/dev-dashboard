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
  projectTestPtyWebSocketUrl: vi.fn(
    (projectId: string, environmentInstanceId?: string) =>
      `ws://localhost/api/projects/${projectId}/tests/pty/connect${
        environmentInstanceId
          ? `?environmentInstanceId=${encodeURIComponent(environmentInstanceId)}`
          : ''
      }`,
  ),
}));

vi.mock('../src/api', () => ({
  fetchProjectTests: mocks.fetchProjectTests,
  fetchProjectTestIntelligence: mocks.fetchProjectTestIntelligence,
  fetchProjectTestHistory: mocks.fetchProjectTestHistory,
  fetchProjectTestPtyStatus: mocks.fetchProjectTestPtyStatus,
  startProjectTestPty: mocks.startProjectTestPty,
  cancelProjectTestPty: mocks.cancelProjectTestPty,
  projectTestPtyWebSocketUrl: mocks.projectTestPtyWebSocketUrl,
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
  });
  ({ default: ProjectTestsPtyPanel } =
    await import('../src/components/ProjectTestsPtyPanel.vue'));
});

afterEach(() => {
  document.body.innerHTML = '';
});

test('carrega os comandos com a interface mínima de execução', async () => {
  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  assert.equal(wrapper.get('[aria-label="Comando de teste"]').text(), 'npm run test');
  assert.equal(wrapper.get('[aria-label="Ambiente de execução"]').text(), 'Local');

  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes('Executar testes'));
  assert.ok(button);
  assert.equal(button.attributes('disabled'), undefined);

  assert.equal(wrapper.find('.tests-pty-heading').exists(), false);
  assert.equal(wrapper.find('.tests-overview').exists(), false);
  assert.equal(wrapper.find('.tests-tabs').exists(), false);
  assert.equal(wrapper.find('.test-intelligence').exists(), false);
  assert.equal(wrapper.find('.tests-local-note').exists(), false);
});

test('executar conecta via WebSocket, escreve a saída e mantém o resultado disponível ao encerrar', async () => {
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
    .find((candidate) => candidate.text().includes('Executar testes'));
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
  assert.ok(wrapper.find('.tests-output').exists());

  socket.emitMessage({ type: 'output', data: 'ok\n' });
  await flushPromises();

  socket.emitMessage({ type: 'exit', exitCode: 0, exitSignal: null });
  await flushPromises();

  assert.ok(wrapper.find('.tests-output').exists());
  assert.ok(
    wrapper
      .findAll('button')
      .some((candidate) => candidate.text().includes('Fechar saída')),
  );
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
    .find((candidate) => candidate.text().includes('Executar testes'));
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

test('propaga Environment Instance para overview, PTY e WebSocket', async () => {
  const environmentInstanceId = 'environment:worktree:projeto-1:wt-1';
  mocks.startProjectTestPty.mockResolvedValue({
    status: 'running',
    exitCode: null,
    exitSignal: null,
    startedAt: '2026-09-18T14:00:00.000Z',
    endedAt: null,
  });

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: {
      project: project(),
      environmentInstanceId,
    },
  });
  await flushPromises();

  assert.deepEqual(mocks.fetchProjectTests.mock.calls[0], [
    'projeto-1',
    { environmentInstanceId },
  ]);
  assert.deepEqual(mocks.fetchProjectTestPtyStatus.mock.calls[0], [
    'projeto-1',
    environmentInstanceId,
  ]);

  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes('Executar testes'));
  assert.ok(button);
  await button.trigger('click');
  await flushPromises();

  assert.deepEqual(mocks.startProjectTestPty.mock.calls[0], [
    'projeto-1',
    'full-suite',
    environmentInstanceId,
  ]);
  assert.deepEqual(mocks.projectTestPtyWebSocketUrl.mock.calls.at(-1), [
    'projeto-1',
    environmentInstanceId,
  ]);

  wrapper.unmount();
});

test('não carrega histórico nem Test Intelligence na tela de execução', async () => {
  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  assert.equal(mocks.fetchProjectTestHistory.mock.calls.length, 0);
  assert.equal(mocks.fetchProjectTestIntelligence.mock.calls.length, 0);
  assert.doesNotMatch(wrapper.text(), /Histórico/);
  assert.doesNotMatch(wrapper.text(), /Test Intelligence/);
  assert.doesNotMatch(wrapper.text(), /dados suficientes para recomendar/i);
});
