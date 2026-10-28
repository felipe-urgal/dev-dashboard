import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

import type { ManagedProcess } from '@dev-dashboard/contracts';

import { RequestGeneration } from '../utils/request-generation';

export type ProcessAction = 'start' | 'stop' | 'restart';

const FALLBACK_MESSAGES: Record<ProcessAction, string> = {
  start: 'Não foi possível iniciar o processo.',
  stop: 'Não foi possível parar o processo.',
  restart: 'Não foi possível reiniciar o processo.',
};

/**
 * Iniciar, parar e reiniciar um processo gerenciado (servidor, Sidekiq,
 * Webpack). Cada tela informa só as chamadas de API; o estado ocupado, a
 * mensagem de erro e a proteção contra troca de projeto no meio da ação ficam
 * aqui, num único lugar.
 *
 * `prepare` roda antes da partida e pode devolver o que `api.start` precisa
 * (ex.: a porta salva) ou `null` para abortar.
 */
export function useProcessControls<TPreparation = undefined>(options: {
  /** Muda quando o contexto (projeto/ambiente) muda: invalida ações em curso. */
  scope: () => string;
  managedProcess: Ref<ManagedProcess | null>;
  errorMessage: Ref<string>;
  /** Chamado depois de cada ação aplicada, normalmente para retomar o polling. */
  afterChange: () => void;
  api: {
    start: (preparation: TPreparation | undefined) => Promise<ManagedProcess>;
    stop: () => Promise<ManagedProcess>;
    /** Quando existe, é usado em vez de parar e iniciar. */
    restart?: () => Promise<ManagedProcess>;
  };
  messages?: Partial<Record<ProcessAction, string>>;
}) {
  const { managedProcess, errorMessage, api } = options;

  const action = ref<ProcessAction | null>(null);
  const requests = new RequestGeneration();

  watch(options.scope, () => {
    requests.invalidate();
    action.value = null;
  });
  onBeforeUnmount(() => requests.invalidate());

  async function run(
    kind: ProcessAction,
    task: (isCurrent: () => boolean) => Promise<void>,
  ): Promise<void> {
    const generation = requests.capture();
    const isCurrent = () => requests.isCurrent(generation);

    action.value = kind;
    errorMessage.value = '';

    try {
      await task(isCurrent);
    } catch (error) {
      if (isCurrent()) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : (options.messages?.[kind] ?? FALLBACK_MESSAGES[kind]);
      }
    } finally {
      if (isCurrent()) action.value = null;
    }
  }

  function apply(next: ManagedProcess): void {
    managedProcess.value = next;
    options.afterChange();
  }

  async function launch(
    prepare: (() => Promise<TPreparation | null>) | undefined,
    isCurrent: () => boolean,
  ): Promise<void> {
    const preparation = prepare ? await prepare() : undefined;
    if (preparation === null || !isCurrent()) return;

    const next = await api.start(preparation);
    if (isCurrent()) apply(next);
  }

  return {
    action,
    start: (prepare?: () => Promise<TPreparation | null>) =>
      run('start', (isCurrent) => launch(prepare, isCurrent)),
    stop: () =>
      run('stop', async (isCurrent) => {
        const next = await api.stop();
        if (isCurrent()) apply(next);
      }),
    restart: (canStop: boolean, prepare?: () => Promise<TPreparation | null>) =>
      run('restart', async (isCurrent) => {
        if (api.restart) {
          const next = await api.restart();
          if (isCurrent()) apply(next);
          return;
        }

        if (canStop) {
          const stopped = await api.stop();
          if (!isCurrent()) return;
          managedProcess.value = stopped;
        }
        await launch(prepare, isCurrent);
      }),
  };
}
