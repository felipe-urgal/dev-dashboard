import { ref } from 'vue';

import type {
  Project,
  RailsGeneratorConfirmation,
  RailsGeneratorField,
  RailsGeneratorKind,
  RailsGeneratorResult,
} from '@dev-dashboard/contracts';

import { prepareProjectRailsGenerator, runProjectRailsGenerator } from '../api';

export function useRailsGenerator(getProject: () => Project) {
  const pendingConfirmation = ref<RailsGeneratorConfirmation | null>(null);
  const preparing = ref(false);
  const running = ref(false);
  const errorMessage = ref('');
  const result = ref<RailsGeneratorResult | null>(null);

  /**
   * `reset()` (chamado pelo componente ao trocar de projeto) não cancela uma
   * preparação/confirmação já em andamento — sem esta guarda, a resposta
   * dela chegaria depois e reescreveria `pendingConfirmation`/`result` com
   * dados do projeto anterior.
   */
  let generation = 0;

  async function prepare(
    kind: RailsGeneratorKind,
    name: string,
    fields: RailsGeneratorField[],
    database?: string,
  ): Promise<void> {
    if (preparing.value) return;
    const requestGeneration = generation;
    preparing.value = true;
    errorMessage.value = '';
    result.value = null;
    try {
      const confirmation = await prepareProjectRailsGenerator(
        getProject().id,
        kind,
        name,
        fields,
        database,
      );
      if (requestGeneration !== generation) return;
      pendingConfirmation.value = confirmation;
    } catch (error) {
      if (requestGeneration !== generation) return;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar a geração.';
    } finally {
      if (requestGeneration === generation) preparing.value = false;
    }
  }

  function cancel(): void {
    pendingConfirmation.value = null;
  }

  async function confirm(): Promise<void> {
    if (!pendingConfirmation.value || running.value) return;
    const requestGeneration = generation;
    running.value = true;
    errorMessage.value = '';
    try {
      const generatorResult = await runProjectRailsGenerator(
        getProject().id,
        pendingConfirmation.value.token,
      );
      if (requestGeneration !== generation) return;
      result.value = generatorResult;
      pendingConfirmation.value = null;
    } catch (error) {
      if (requestGeneration !== generation) return;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível concluir a geração.';
    } finally {
      if (requestGeneration === generation) running.value = false;
    }
  }

  function reset(): void {
    generation += 1;
    pendingConfirmation.value = null;
    result.value = null;
    errorMessage.value = '';
    preparing.value = false;
    running.value = false;
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
