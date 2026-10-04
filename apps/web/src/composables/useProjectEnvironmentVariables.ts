import { onBeforeUnmount, ref, watch } from 'vue';

import type {
  Project,
  ProjectEnvironmentOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectEnvironmentVariables,
  fetchProjectEnvironmentVariableValue,
} from '../api';
import { RequestGeneration } from '../utils/request-generation';

/**
 * Lista somente leitura das variáveis declaradas nos arquivos .env
 * reconhecidos do projeto. Valores sensíveis permanecem ausentes do resumo e
 * só são buscados quando o usuário solicita explicitamente a exibição.
 */
export function useProjectEnvironmentVariables(
  getProject: () => Project,
  getEnvironmentInstanceId: () => string | undefined = () => undefined,
) {
  const overview = ref<ProjectEnvironmentOverview | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const revealedValues = ref<Record<string, string>>({});
  const revealingValues = ref<Record<string, boolean>>({});

  const projectRequests = new RequestGeneration();
  const valueRequests = new RequestGeneration();

  function variableKey(file: string, name: string): string {
    return JSON.stringify([file, name]);
  }

  function isCurrentProject(
    projectId: string,
    environmentInstanceId: string | undefined,
    generation: number,
  ): boolean {
    return (
      getProject().id === projectId &&
      getEnvironmentInstanceId() === environmentInstanceId &&
      projectRequests.isCurrent(generation)
    );
  }

  function isCurrentValueRequest(
    projectId: string,
    environmentInstanceId: string | undefined,
    generation: number,
  ): boolean {
    return (
      getProject().id === projectId &&
      getEnvironmentInstanceId() === environmentInstanceId &&
      valueRequests.isCurrent(generation)
    );
  }

  function clearRevealedValues(): void {
    valueRequests.invalidate();
    revealedValues.value = {};
    revealingValues.value = {};
  }

  function hasRevealedValue(file: string, name: string): boolean {
    return Object.prototype.hasOwnProperty.call(
      revealedValues.value,
      variableKey(file, name),
    );
  }

  function revealedValue(file: string, name: string): string {
    return revealedValues.value[variableKey(file, name)] ?? '';
  }

  function isRevealingValue(file: string, name: string): boolean {
    return revealingValues.value[variableKey(file, name)] === true;
  }

  async function revealValue(file: string, name: string): Promise<void> {
    const key = variableKey(file, name);
    if (revealingValues.value[key] || hasRevealedValue(file, name)) return;

    const projectId = getProject().id;
    const environmentInstanceId = getEnvironmentInstanceId();
    const generation = valueRequests.capture();
    revealingValues.value[key] = true;
    errorMessage.value = '';

    try {
      const variable = await fetchProjectEnvironmentVariableValue(
        projectId,
        file,
        name,
        environmentInstanceId,
      );
      if (isCurrentValueRequest(projectId, environmentInstanceId, generation)) {
        revealedValues.value[key] = variable.value;
      }
    } catch (error) {
      if (isCurrentValueRequest(projectId, environmentInstanceId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível exibir o valor da variável.';
      }
    } finally {
      if (isCurrentValueRequest(projectId, environmentInstanceId, generation)) {
        delete revealingValues.value[key];
      }
    }
  }

  function hideValue(file: string, name: string): void {
    delete revealedValues.value[variableKey(file, name)];
  }

  async function refresh(): Promise<void> {
    const projectId = getProject().id;
    const environmentInstanceId = getEnvironmentInstanceId();
    const generation = projectRequests.capture();
    clearRevealedValues();
    loading.value = true;
    errorMessage.value = '';

    try {
      const result = await fetchProjectEnvironmentVariables(
        projectId,
        environmentInstanceId,
      );
      if (isCurrentProject(projectId, environmentInstanceId, generation)) {
        overview.value = result;
      }
    } catch (error) {
      if (isCurrentProject(projectId, environmentInstanceId, generation)) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar as variáveis de ambiente.';
      }
    } finally {
      if (isCurrentProject(projectId, environmentInstanceId, generation)) {
        loading.value = false;
      }
    }
  }

  async function initialize(): Promise<void> {
    projectRequests.invalidate();
    overview.value = null;
    loading.value = false;
    errorMessage.value = '';
    await refresh();
  }

  watch(
    () => [getProject().id, getEnvironmentInstanceId()] as const,
    () => {
      void initialize();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    projectRequests.invalidate();
    valueRequests.invalidate();
  });

  return {
    overview,
    loading,
    errorMessage,
    refresh,
    revealValue,
    hideValue,
    hasRevealedValue,
    revealedValue,
    isRevealingValue,
  };
}
