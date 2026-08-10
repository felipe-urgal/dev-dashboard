import type {
  AiImplementationExecution,
  AiProviderId,
  ProjectAiProviderStatus,
} from '@dev-dashboard/contracts';

export type AiFallbackMode = 'off' | 'offer';

export interface AiFallbackOffer {
  fromProvider: AiProviderId;
  toProvider: AiProviderId;
  reason: string;
}

function latestError(execution: AiImplementationExecution): string | null {
  const event = execution.events
    .slice()
    .reverse()
    .find((candidate) => candidate.type === 'error');
  return event?.type === 'error' ? event.message : null;
}

/**
 * A primeira policy de fallback é deliberadamente conservadora: só oferece
 * outro provider quando a execução falhou e o provider selecionado está
 * indisponível no status atual. Erros de ferramenta/modelo com provider ainda
 * disponível continuam encerrando normalmente, sem sugerir troca.
 */
export function resolveAiFallbackOffer(
  mode: AiFallbackMode,
  execution: AiImplementationExecution | null,
  selectedProvider: AiProviderId,
  providers: readonly ProjectAiProviderStatus[],
): AiFallbackOffer | null {
  if (mode === 'off' || execution?.status !== 'failed') return null;

  const failedProvider = providers.find(
    (provider) => provider.id === selectedProvider,
  );
  if (!failedProvider || failedProvider.available) return null;

  const target = providers.find(
    (provider) => provider.id !== selectedProvider && provider.available,
  );
  if (!target) return null;

  return {
    fromProvider: selectedProvider,
    toProvider: target.id,
    reason:
      latestError(execution) ??
      'O provider selecionado ficou indisponível durante a execução.',
  };
}
