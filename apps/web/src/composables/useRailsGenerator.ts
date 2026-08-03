import { ref } from 'vue';

import type {
  Project,
  RailsExecutionRuntime,
  RailsGeneratorConfirmation,
  RailsGeneratorField,
  RailsGeneratorKind,
  RailsGeneratorResult,
} from '@dev-dashboard/contracts';

import { prepareProjectRailsGenerator, runProjectRailsGenerator } from '../api';

export function useRailsGenerator(
  getProject: () => Project,
  getRuntime: () => RailsExecutionRuntime = () => 'auto',
) {
  const pendingConfirmation = ref<RailsGeneratorConfirmation | null>(null);
  const preparing = ref(false);
  const running = ref(false);
  const errorMessage = ref('');
  const result = ref<RailsGeneratorResult | null>(null);

  async function prepare(kind: RailsGeneratorKind, name: string, fields: RailsGeneratorField[], database?: string): Promise<void> {
    if (preparing.value) return;
    preparing.value = true;
    errorMessage.value = '';
    result.value = null;
    try {
      pendingConfirmation.value = await prepareProjectRailsGenerator(
        getProject().id,
        kind,
        name,
        fields,
        database,
        getRuntime(),
      );
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Não foi possível preparar a geração.';
    } finally {
      preparing.value = false;
    }
  }

  function cancel(): void {
    pendingConfirmation.value = null;
  }

  async function confirm(): Promise<void> {
    if (!pendingConfirmation.value || running.value) return;
    running.value = true;
    errorMessage.value = '';
    try {
      result.value = await runProjectRailsGenerator(getProject().id, pendingConfirmation.value.token);
      pendingConfirmation.value = null;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Não foi possível concluir a geração.';
    } finally {
      running.value = false;
    }
  }

  function reset(): void {
    pendingConfirmation.value = null;
    result.value = null;
    errorMessage.value = '';
  }

  return {
    pendingConfirmation,
    preparing,
    running,
    errorMessage,
    result,
    prepare,
    cancel,
    confirm,
    reset,
  };
}
