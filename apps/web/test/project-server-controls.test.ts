import { effectScope, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ManagedProcess, Project } from '@dev-dashboard/contracts';

const { startProjectProcess, stopProjectProcess } = vi.hoisted(() => ({
  startProjectProcess: vi.fn(),
  stopProjectProcess: vi.fn(),
}));

vi.mock('../src/api', () => ({ startProjectProcess, stopProjectProcess }));

import { useProjectServerControls } from '../src/composables/useProjectServerControls';

const processOf = (status: ManagedProcess['status']): ManagedProcess => ({
  id: 'p1:server',
  projectId: 'p1',
  kind: 'server',
  status,
});

function setup(projectId = 'p1') {
  const project = ref({ id: projectId } as Project);
  const managedProcess = ref<ManagedProcess | null>(null);
  const errorMessage = ref('');
  const scheduleProcessPolling = vi.fn();
  const scope = effectScope();
  const controls = scope.run(() =>
    useProjectServerControls({
      getProject: () => project.value,
      managedProcess,
      errorMessage,
      scheduleProcessPolling,
    }),
  )!;
  return {
    controls,
    project,
    managedProcess,
    errorMessage,
    scheduleProcessPolling,
    scope,
  };
}

describe('useProjectServerControls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inicia sem corpo extra e agenda o acompanhamento do processo', async () => {
    startProjectProcess.mockResolvedValue(processOf('starting'));
    const { controls, managedProcess, scheduleProcessPolling } = setup();

    await controls.start();

    expect(startProjectProcess).toHaveBeenCalledWith('p1');
    expect(managedProcess.value?.status).toBe('starting');
    expect(scheduleProcessPolling).toHaveBeenCalled();
    expect(controls.action.value).toBeNull();
  });

  it('aborta a partida quando prepare devolve null', async () => {
    const { controls } = setup();

    await controls.start(async () => null);

    expect(startProjectProcess).not.toHaveBeenCalled();
  });

  it('reiniciar para o processo e depois inicia com a porta preparada', async () => {
    stopProjectProcess.mockResolvedValue(processOf('stopped'));
    startProjectProcess.mockResolvedValue(processOf('starting'));
    const { controls } = setup();

    await controls.restart(true, async () => ({ port: 4000 }));

    expect(stopProjectProcess).toHaveBeenCalledWith('p1');
    expect(startProjectProcess).toHaveBeenCalledWith('p1', { port: 4000 });
  });

  it('publica a mensagem de erro e libera o estado ocupado', async () => {
    stopProjectProcess.mockRejectedValue(new Error('falhou de verdade'));
    const { controls, errorMessage } = setup();

    await controls.stop();

    expect(errorMessage.value).toBe('falhou de verdade');
    expect(controls.action.value).toBeNull();
  });

  it('ignora o resultado quando o projeto muda durante a ação', async () => {
    let resolveStart: (value: ManagedProcess) => void = () => undefined;
    startProjectProcess.mockReturnValue(
      new Promise<ManagedProcess>((resolve) => (resolveStart = resolve)),
    );
    const { controls, project, managedProcess } = setup();

    const pending = controls.start();
    project.value = { id: 'p2' } as Project;
    await nextTick();
    resolveStart(processOf('running'));
    await pending;

    expect(managedProcess.value).toBeNull();
  });
});
