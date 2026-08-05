import { onBeforeUnmount, ref, watch } from 'vue';

import type { Project, ProjectEnvironmentOverview } from '@dev-dashboard/contracts';

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
export function useProjectEnvironmentVariables(getProject: () => Project) {
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

  function isCurrentProject(projectId: string, generation: number): boolean {
    return getProject().id === projectId && projectRequests.isCurrent(generation);
  }

  function isCurrentValueRequest(projectId: string, generation: number): boolean {
    return getProject().id === projectId && valueRequests.isCurrent(generation);
  }

  function clearRevealedValues(): void {
    valueRequests.invalidate();
    revealedValues.value = {};
    revealingValues.value = {};
  }

  function hasRevealedValue(file: string, name: string): boolean {
    return Object.prototype.hasOwnProperty.call(revealedValues.value, variableKey(file, name));
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
    const generation = valueRequests.capture();
    revealingValues.value[key] = true;
    errorMessage.value = '';

    try {
      const variable = await fetchProjectEnvironmentVariableValue(projectId, file, name);
      if (isCurrentValueRequest(projectId, generation)) {
        revealedValues.value[key] = variable.value;
      }
    } catch (error) {
      if (isCurrentValueRequest(projectId, generation)) {
        errorMessage.value =
          error instanceof Error ? error.message : 'Não foi possível exibir o valor da variável.';
      }
    } finally {
      if (isCurrentValueRequest(projectId, generation)) {
        delete revealingValues.value[key];
      }
    }
  }

  function hideValue(file: string, name: string): void {
    delete revealedValues.value[variableKey(file, name)];
  }

  async function refresh(): Promise<void> {
    const projectId = getProject().id;
    const generation = projectRequests.capture();
    clearRevealedValues();
    loading.value = true;
    errorMessage.value = '';

    try {
      const result = await fetchProjectEnvironmentVariables(projectId);
      if (isCurrentProject(projectId, generation)) {
        overview.value = result;
      }
    } catch (error) {
      if (isCurrentProject(projectId, generation)) {
        errorMessage.value =
          error instanceof Error ? error.message : 'Não foi possível consultar as variáveis de ambiente.';
      }
    } finally {
      if (isCurrentProject(projectId, generation)) {
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

  watch(() => getProject().id, () => { void initialize(); }, { immediate: true });

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
