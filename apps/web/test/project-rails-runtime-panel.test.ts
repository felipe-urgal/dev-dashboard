import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ManagedProcessStatus,
  Project,
  RailsWorkerId,
  RailsWorkerOverview,
} from '@dev-dashboard/contracts';

const {
  fetchProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
  restartProjectRailsWorker,
  fetchProjectRailsWorkerLog,
  followProjectRailsWorkerLogEvents,
  clearProjectRailsWorkerLog,
} = vi.hoisted(() => ({
  fetchProjectRailsWorker: vi.fn(),
  startProjectRailsWorker: vi.fn(),
  stopProjectRailsWorker: vi.fn(),
  restartProjectRailsWorker: vi.fn(),
  fetchProjectRailsWorkerLog: vi.fn(),
  followProjectRailsWorkerLogEvents: vi.fn(
    (
      _projectId: string,
      workerId: RailsWorkerId,
      onEvent: (log: unknown) => void,
    ) => {
      onEvent({
        projectId: 'p1',
        processId: `p1:${workerId}`,
        content: `${workerId} log de exemplo`,
        sizeBytes: 20,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: '2026-08-05T12:00:00.000Z',
      });
      return { close: vi.fn(), done: new Promise<void>(() => undefined) };
    },
  ),
  clearProjectRailsWorkerLog: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectRailsWorker,
  startProjectRailsWorker,
  stopProjectRailsWorker,
  restartProjectRailsWorker,
  fetchProjectRailsWorkerLog,
  followProjectRailsWorkerLogEvents,
  clearProjectRailsWorkerLog,
}));

import ProjectRailsRuntimePanel from '../src/components/ProjectRailsRuntimePanel.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'API Rails',
  path: '/projetos/api-rails',
  type: 'rails',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

/** Botão de iniciar da barra de status (único enquanto há log). */
function startButton(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .find('.process-bar')
    .findAll('button')
    .find((button) => button.text().startsWith('Iniciar'));
}

function overview(
  workerId: RailsWorkerId,
  detected = workerId === 'sidekiq',
  status?: ManagedProcessStatus,
): RailsWorkerOverview {
  return {
    id: workerId,
    detected,
    process: status
      ? {
          id: `p1:worker:${workerId}`,
          projectId: 'p1',
          kind: workerId === 'sidekiq' ? 'worker' : 'webpack',
          status,
          pid: workerId === 'sidekiq' ? 4242 : 4343,
          command: `/projetos/api-rails/bin/${workerId}`,
          startedAt: '2026-08-05T12:00:00.000Z',
          ...(status === 'failed' ? { exitCode: 1 } : {}),
        }
      : null,
  };
}

describe('ProjectRailsRuntimePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fetchProjectRailsWorker.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) => overview(workerId),
    );
    fetchProjectRailsWorkerLog.mockImplementation(
      async (_projectId: string, workerId: RailsWorkerId) => ({
        projectId: 'p1',
        processId: `p1:${workerId}`,
        content: `${workerId} log de exemplo`,
        sizeBytes: 20,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: '2026-08-05T12:00:00.000Z',
      }),
    );
  });

  it('inicia o Sidekiq pela aba dedicada', async () => {
    startProjectRailsWorker.mockResolvedValueOnce({
      id: 'p1:worker:sidekiq',
      projectId: 'p1',
      kind: 'worker',
      status: 'running',
      pid: 4242,
      command: '/projetos/api-rails/bin/sidekiq',
      startedAt: '2026-08-05T12:00:00.000Z',
    });

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'sidekiq' },
    });

    await flushPromises();

    await startButton(wrapper)!.trigger('click');
    await flushPromises();

    expect(startProjectRailsWorker).toHaveBeenCalledWith('p1', 'sidekiq');
    expect(wrapper.text()).toContain('4242');
    expect(wrapper.text()).toContain('Executando');
    expect(
      wrapper.find('.process-bar-state[data-tone="running"]').exists(),
    ).toBe(true);
    expect(wrapper.findAll('.process-console')).toHaveLength(1);

    wrapper.unmount();
  });

  it('propaga Environment Instance para status, start e stream do worker', async () => {
    const environmentInstanceId = 'environment:worktree:p1:wt-1';
    fetchProjectRailsWorker.mockResolvedValueOnce(overview('sidekiq', true));
    startProjectRailsWorker.mockResolvedValueOnce({
      id: 'p1:worker:sidekiq',
      projectId: 'p1',
      environmentInstanceId,
      kind: 'worker',
      status: 'running',
      pid: 4242,
      command: '/worktree/bin/sidekiq',
      startedAt: '2026-08-05T12:00:00.000Z',
    });

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: {
        project,
        workerId: 'sidekiq',
        environmentInstanceId,
      },
    });
    await flushPromises();

    expect(fetchProjectRailsWorker).toHaveBeenCalledWith(
      'p1',
      'sidekiq',
      environmentInstanceId,
    );

    await startButton(wrapper)!.trigger('click');
    await flushPromises();

    expect(startProjectRailsWorker).toHaveBeenCalledWith(
      'p1',
      'sidekiq',
      environmentInstanceId,
    );

    expect(followProjectRailsWorkerLogEvents).toHaveBeenCalledWith(
      'p1',
      'sidekiq',
      expect.any(Function),
      environmentInstanceId,
    );

    wrapper.unmount();
  });

  it('representa corretamente os estados transitórios e de falha', async () => {
    fetchProjectRailsWorker.mockResolvedValueOnce(
      overview('sidekiq', true, 'starting'),
    );

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'sidekiq' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Iniciando');
    expect(
      wrapper.find('.process-bar-state[data-tone="running"]').exists(),
    ).toBe(false);
    expect(
      wrapper
        .find('.process-bar')
        .findAll('button')
        .find((button) => button.text().includes('Iniciando'))
        ?.attributes('disabled'),
    ).toBe('');

    fetchProjectRailsWorker.mockResolvedValueOnce(
      overview('sidekiq', true, 'stopping'),
    );
    await wrapper.vm.$forceUpdate();
    wrapper.unmount();

    const stoppingWrapper = mount(ProjectRailsRuntimePanel, {
      props: { project: { ...project, id: 'p2' }, workerId: 'sidekiq' },
    });
    await flushPromises();
    expect(stoppingWrapper.text()).toContain('Parando…');
    expect(
      stoppingWrapper.find('.process-bar-state[data-tone="running"]').exists(),
    ).toBe(false);
    stoppingWrapper.unmount();

    fetchProjectRailsWorker.mockResolvedValueOnce(
      overview('sidekiq', true, 'failed'),
    );
    const failedWrapper = mount(ProjectRailsRuntimePanel, {
      props: { project: { ...project, id: 'p3' }, workerId: 'sidekiq' },
    });
    await flushPromises();

    expect(failedWrapper.text()).toContain('encerrou com falha');
    expect(failedWrapper.text()).toContain('Iniciar novamente');
    failedWrapper.unmount();
  });

  it('permite recuperar o Webpack após falha sem oferecer restart', async () => {
    fetchProjectRailsWorker.mockResolvedValueOnce(
      overview('webpack', true, 'failed'),
    );
    startProjectRailsWorker.mockResolvedValueOnce({
      id: 'p1:worker:webpack',
      projectId: 'p1',
      kind: 'webpack',
      status: 'running',
      pid: 4343,
      command: '/projetos/api-rails/bin/webpack-dev-server',
      startedAt: '2026-08-05T12:10:00.000Z',
    });

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'webpack' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Webpack encerrou com falha');
    expect(wrapper.text()).toContain('Iniciar novamente');
    expect(
      wrapper.findAll('button').some((button) => button.text() === 'Reiniciar'),
    ).toBe(false);

    await startButton(wrapper)!.trigger('click');
    await flushPromises();

    expect(startProjectRailsWorker).toHaveBeenCalledWith('p1', 'webpack');
    expect(wrapper.text()).toContain('Executando');

    wrapper.unmount();
  });

  const yarnError =
    'error Error: Failed to replace env in config: ${FONTAWESOME_TOKEN}';

  function failedLog(workerId: RailsWorkerId) {
    return {
      projectId: 'p1',
      processId: `p1:${workerId}`,
      content: yarnError,
      sizeBytes: yarnError.length,
      truncated: false,
      masked: false,
      redactionCount: 0,
      readAt: '2026-08-05T12:00:05.000Z',
    };
  }

  it('mostra a saída e o código de um processo que já terminou com falha', async () => {
    fetchProjectRailsWorker.mockResolvedValue(
      overview('webpack', true, 'failed'),
    );
    fetchProjectRailsWorkerLog.mockResolvedValue(failedLog('webpack'));

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'webpack' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('encerrou com falha (código 1)');
    expect(wrapper.text()).toContain(yarnError);
    expect(fetchProjectRailsWorkerLog).toHaveBeenCalledWith('p1', 'webpack');
    expect(followProjectRailsWorkerLogEvents).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('lê o log final quando o processo morre com a aba aberta', async () => {
    vi.useFakeTimers();
    try {
      fetchProjectRailsWorker
        .mockResolvedValueOnce(overview('webpack', true, 'running'))
        .mockResolvedValue(overview('webpack', true, 'failed'));
      fetchProjectRailsWorkerLog.mockResolvedValue(failedLog('webpack'));

      const wrapper = mount(ProjectRailsRuntimePanel, {
        props: { project, workerId: 'webpack' },
      });
      await flushPromises();
      expect(wrapper.text()).toContain('Executando');
      expect(fetchProjectRailsWorkerLog).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(6_000);
      await flushPromises();

      expect(wrapper.text()).toContain('encerrou com falha');
      expect(wrapper.text()).toContain(yarnError);
      expect(fetchProjectRailsWorkerLog).toHaveBeenCalled();
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o Sidekiq oferece reiniciar enquanto roda', async () => {
    fetchProjectRailsWorker.mockResolvedValueOnce(
      overview('sidekiq', true, 'running'),
    );

    const wrapper = mount(ProjectRailsRuntimePanel, {
      props: { project, workerId: 'sidekiq' },
    });
    await flushPromises();

    expect(
      wrapper
        .find('.process-bar')
        .findAll('button')
        .some((button) => button.text() === 'Reiniciar'),
    ).toBe(true);

    wrapper.unmount();
  });
});
