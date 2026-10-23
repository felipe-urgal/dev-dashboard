import { computed, ref, type Ref } from 'vue';

import { providerFallbackDiagnostic } from '../agent-provider-doctor';
import {
  fetchAgentProviders,
  type AgentProviderId,
  type AgentProviderStatus,
} from '../api/agent-runtime';

const providerIds: AgentProviderId[] = [
  'automatic',
  'codex',
  'claude-code',
  'chatgpt-browser',
];

/**
 * Owns the provider doctor snapshot and manual refresh.
 * A project change or newer snapshot invalidates outstanding refreshes.
 * This is observational UI state; it never grants provider capabilities.
 */
export function useAgentProviderStatus(
  currentProjectId: () => string,
  selectedProviderId: Ref<AgentProviderId>,
  reportError: (message: string) => void,
  clearError: () => void,
  loadProviders: typeof fetchAgentProviders = fetchAgentProviders,
) {
  const providers = ref<AgentProviderStatus[]>([]);
  const providerRefreshing = ref(false);
  let version = 0;

  const providerOptions = computed<AgentProviderStatus[]>(() =>
    providerIds.map(
      (providerId) =>
        providers.value.find((provider) => provider.providerId === providerId) ?? {
          providerId,
          availability: 'unavailable',
          observedAt: '',
          reason: 'Provider não configurado neste runtime.',
          diagnostic: providerFallbackDiagnostic(providerId),
        },
    ),
  );

  const currentProvider = computed(
    () =>
      providerOptions.value.find(
        (provider) => provider.providerId === selectedProviderId.value,
      ) ?? null,
  );

  const availableProviderCount = computed(
    () =>
      providerOptions.value.filter(
        (provider) => provider.availability === 'available',
      ).length,
  );

  function resetProviders(): void {
    version += 1;
    providers.value = [];
    providerRefreshing.value = false;
  }

  function applyLoadedProviders(
    snapshot: AgentProviderStatus[],
    projectId: string,
  ): void {
    if (projectId !== currentProjectId()) return;
    version += 1;
    providers.value = snapshot;
    providerRefreshing.value = false;
  }

  async function refreshProviders(): Promise<void> {
    if (providerRefreshing.value) return;
    const projectId = currentProjectId();
    const requestVersion = ++version;
    providerRefreshing.value = true;
    clearError();
    const isCurrent = () =>
      requestVersion === version && projectId === currentProjectId();
    try {
      const snapshot = await loadProviders();
      if (isCurrent()) providers.value = snapshot;
    } catch (error) {
      if (isCurrent()) {
        reportError(
          error instanceof Error
            ? error.message
            : 'Não foi possível revalidar os providers.',
        );
      }
    } finally {
      if (isCurrent()) providerRefreshing.value = false;
    }
  }

  return {
    providers,
    providerRefreshing,
    providerOptions,
    currentProvider,
    availableProviderCount,
    resetProviders,
    applyLoadedProviders,
    refreshProviders,
  };
}
