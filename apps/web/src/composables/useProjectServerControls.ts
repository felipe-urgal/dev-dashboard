import type { ManagedProcess, Project } from '@dev-dashboard/contracts';
import type { Ref } from 'vue';

import { startProjectProcess, stopProjectProcess } from '../api';
import { useProcessControls } from './useProcessControls';

export type { ProcessAction as ServerAction } from './useProcessControls';

/** Resultado de `prepare`: porta a usar. `null` aborta a ação. */
export type ServerStartPreparation = { port?: number | null };

/** Controles do servidor do projeto, sobre `useProcessControls`. */
export function useProjectServerControls(options: {
  getProject: () => Project;
  getEnvironmentInstanceId?: () => string | undefined;
  managedProcess: Ref<ManagedProcess | null>;
  errorMessage: Ref<string>;
  scheduleProcessPolling: () => void;
}) {
  const { getProject } = options;
  const getEnvironmentInstanceId =
    options.getEnvironmentInstanceId ?? (() => undefined);

  return useProcessControls<ServerStartPreparation>({
    scope: () => `${getProject().id}:${getEnvironmentInstanceId() ?? ''}`,
    managedProcess: options.managedProcess,
    errorMessage: options.errorMessage,
    afterChange: options.scheduleProcessPolling,
    messages: {
      start: 'Não foi possível iniciar o servidor.',
      stop: 'Não foi possível parar o servidor.',
      restart: 'Não foi possível reiniciar o servidor.',
    },
    api: {
      start: (preparation) => {
        const environmentInstanceId = getEnvironmentInstanceId();
        const body = {
          ...(preparation ? { port: preparation.port ?? null } : {}),
          ...(environmentInstanceId ? { environmentInstanceId } : {}),
        };
        return Object.keys(body).length > 0
          ? startProjectProcess(getProject().id, body)
          : startProjectProcess(getProject().id);
      },
      stop: () => {
        const environmentInstanceId = getEnvironmentInstanceId();
        return environmentInstanceId
          ? stopProjectProcess(getProject().id, environmentInstanceId)
          : stopProjectProcess(getProject().id);
      },
    },
  });
}
