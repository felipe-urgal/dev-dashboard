import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type { Project, ProjectTestOverview } from '@dev-dashboard/contracts';

const mocks = vi.hoisted(() => ({
  fetchProjectTests: vi.fn(),
  fetchProjectTestFiles: vi.fn(),
  fetchProjectTestIntelligence: vi.fn(),
  fetchProjectTestHistory: vi.fn(),
  fetchProjectTestPtyStatus: vi.fn(),
  fetchProjectTestPtyResult: vi.fn(),
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
  fetchProjectTestFiles: mocks.fetchProjectTestFiles,
  fetchProjectTestIntelligence: mocks.fetchProjectTestIntelligence,
  fetchProjectTestHistory: mocks.fetchProjectTestHistory,
  fetchProjectTestPtyStatus: mocks.fetchProjectTestPtyStatus,
  fetchProjectTestPtyResult: mocks.fetchProjectTestPtyResult,
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
        supportsFileTarget: true,
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
  mocks.fetchProjectTestFiles.mockResolvedValue([
    { path: 'src/a.test.ts' },
    { path: 'src/b.test.ts' },
    { path: 'src/util/c.test.ts' },
  ]);
  mocks.fetchProjectTestPtyStatus.mockResolvedValue(null);
  mocks.fetchProjectTestPtyResult.mockResolvedValue(null);
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

function runningSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    status: 'running',
    commandId: 'full-suite',
    environmentInstanceId: 'environment:primary:projeto-1',
    scope: 'full-suite',
    targetFiles: [],
    cancelled: false,
    truncated: false,
    exitCode: null,
    exitSignal: null,
    startedAt: '2026-08-11T10:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

function buttonByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper
    .findAll('button')
    .find((candidate) => candidate.text().includes(text));
}

test('sem seleção, executa todos os testes, conecta via WebSocket e mantém a saída ao encerrar', async () => {
  mocks.startProjectTestPty.mockResolvedValue(runningSnapshot());

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  const button = buttonByText(wrapper, 'Executar todos');
  assert.ok(button);
  await button.trigger('click');
  await flushPromises();

  assert.deepEqual(mocks.startProjectTestPty.mock.calls[0], [
    'projeto-1',
    'full-suite',
    undefined,
    { mode: 'full-suite' },
  ]);
  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0]!;
  socket.readyState = 1;
  socket.emit('open', {});
  socket.emitMessage({
    type: 'ready',
    snapshot: { ...runningSnapshot(), buffer: '' },
  });
  await flushPromises();

  socket.emitMessage({ type: 'output', data: 'ok\n' });
  socket.emitMessage({ type: 'exit', exitCode: 0, exitSignal: null });
  await flushPromises();

  assert.ok(buttonByText(wrapper, 'Fechar saída'));
  wrapper.unmount();
});

test('executa somente os arquivos selecionados', async () => {
  mocks.startProjectTestPty.mockResolvedValue(
    runningSnapshot({
      scope: 'targeted',
      targetFiles: ['src/a.test.ts', 'src/util/c.test.ts'],
    }),
  );

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
    attachTo: document.body,
  });
  await flushPromises();

  const boxes = wrapper.findAll('.test-group li input[type="checkbox"]');
  assert.equal(boxes.length, 3);
  await boxes[0]!.setValue(true);
  await boxes[2]!.setValue(true);

  const button = buttonByText(wrapper, 'Executar selecionados (2)');
  assert.ok(button);
  await button.trigger('click');
  await flushPromises();

  assert.deepEqual(mocks.startProjectTestPty.mock.calls[0]?.[3], {
    mode: 'files',
    paths: ['src/a.test.ts', 'src/util/c.test.ts'],
  });
  wrapper.unmount();
});

test('selecionar relacionados marca só os testes que existem na lista', async () => {
  mocks.fetchProjectTestIntelligence.mockResolvedValue({
    commandId: 'full-suite',
    state: 'direct',
    recommendation: 'targeted',
    baseBranch: 'main',
    currentBranch: 'feature/testes',
    changedFiles: ['src/app.ts'],
    testFiles: ['src/b.test.ts', 'src/inexistente.test.ts'],
    unmappedFiles: [],
    evidence: [],
  });
  mocks.startProjectTestPty.mockResolvedValue(
    runningSnapshot({ scope: 'targeted', targetFiles: ['src/b.test.ts'] }),
  );

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  const related = buttonByText(wrapper, 'Selecionar relacionados (1)');
  assert.ok(related);
  await related.trigger('click');
  await flushPromises();

  const run = buttonByText(wrapper, 'Executar selecionados (1)');
  assert.ok(run);
  await run.trigger('click');
  await flushPromises();

  assert.deepEqual(mocks.startProjectTestPty.mock.calls[0]?.[3], {
    mode: 'files',
    paths: ['src/b.test.ts'],
  });
  wrapper.unmount();
});

test('cancelar chama cancelProjectTestPty enquanto a execução está em andamento', async () => {
  mocks.startProjectTestPty.mockResolvedValue(runningSnapshot());
  mocks.cancelProjectTestPty.mockResolvedValue(undefined);

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  const startButton = buttonByText(wrapper, 'Executar todos');
  assert.ok(startButton);
  await startButton.trigger('click');
  await flushPromises();

  const cancelButton = buttonByText(wrapper, 'Cancelar');
  assert.ok(cancelButton);
  await cancelButton.trigger('click');
  await flushPromises();

  assert.equal(mocks.cancelProjectTestPty.mock.calls.length, 1);
  wrapper.unmount();
});

test('propaga Environment Instance para overview, arquivos, PTY e WebSocket', async () => {
  const environmentInstanceId = 'environment:worktree:projeto-1:wt-1';
  mocks.startProjectTestPty.mockResolvedValue(
    runningSnapshot({ environmentInstanceId }),
  );

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
  assert.deepEqual(mocks.fetchProjectTestFiles.mock.calls[0], [
    'projeto-1',
    'full-suite',
    environmentInstanceId,
  ]);

  const button = buttonByText(wrapper, 'Executar todos');
  assert.ok(button);
  await button.trigger('click');
  await flushPromises();

  assert.deepEqual(mocks.startProjectTestPty.mock.calls[0], [
    'projeto-1',
    'full-suite',
    environmentInstanceId,
    { mode: 'full-suite' },
  ]);
  assert.deepEqual(mocks.projectTestPtyWebSocketUrl.mock.calls.at(-1), [
    'projeto-1',
    environmentInstanceId,
  ]);

  wrapper.unmount();
});

test('reconecta preservando a suíte identificada pelo snapshot PTY', async () => {
  mocks.fetchProjectTests.mockResolvedValue({
    ...overview(),
    commands: [
      overview().commands[0]!,
      {
        ...overview().commands[0]!,
        id: 'secondary-suite',
        label: 'npm run test:secondary',
      },
    ],
  });
  mocks.fetchProjectTestPtyStatus.mockResolvedValue(
    runningSnapshot({ commandId: 'secondary-suite' }),
  );

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  assert.equal(
    (
      wrapper.get('[aria-label="Comando de teste"]')
        .element as HTMLSelectElement
    ).value,
    'secondary-suite',
  );
  wrapper.unmount();
});

test('depois de uma execução com falhas, "Rodar só as que falharam" executa apenas esses arquivos', async () => {
  mocks.startProjectTestPty.mockResolvedValue(runningSnapshot());
  mocks.fetchProjectTestPtyResult.mockResolvedValue({
    runner: 'vitest',
    summary: { total: 3, passed: 2, failed: 1, pending: 0 },
    failures: [
      {
        id: 'src/b.test.ts:soma',
        runner: 'vitest',
        name: 'soma falha',
        message: 'expected 1 to be 2',
        location: { path: 'src/b.test.ts', line: 7 },
        stack: [],
      },
    ],
    failedFiles: ['src/b.test.ts'],
  });

  const wrapper = mount(ProjectTestsPtyPanel, {
    props: { project: project() },
  });
  await flushPromises();

  await buttonByText(wrapper, 'Executar todos')!.trigger('click');
  await flushPromises();

  const socket = FakeWebSocket.instances[0]!;
  socket.readyState = 1;
  socket.emit('open', {});
  socket.emitMessage({
    type: 'ready',
    snapshot: { ...runningSnapshot(), buffer: '' },
  });
  socket.emitMessage({ type: 'exit', exitCode: 1, exitSignal: null });
  await flushPromises();

  assert.match(wrapper.text(), /soma falha/);
  mocks.startProjectTestPty.mockClear();
  mocks.startProjectTestPty.mockResolvedValue(
    runningSnapshot({ scope: 'targeted', targetFiles: ['src/b.test.ts'] }),
  );

  const rerun = buttonByText(wrapper, 'Rodar só as que falharam');
  assert.ok(rerun);
  await rerun.trigger('click');
  await flushPromises();

  assert.deepEqual(mocks.startProjectTestPty.mock.calls[0]?.[3], {
    mode: 'files',
    paths: ['src/b.test.ts'],
  });
  wrapper.unmount();
});
