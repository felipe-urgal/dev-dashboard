import { computed, ref } from 'vue';

import type { AgentConcreteProviderId } from '../api/agent-runtime';
import type { IntegrationDiscoveryTarget } from './useAgentIntegrationDiscovery';

type IntegrationMutationKind =
  'install-mcp' | 'install-plugin' | 'authenticate' | 'toggle' | 'uninstall';

interface MutationOptions<Result> {
  kind: IntegrationMutationKind;
  providerId: AgentConcreteProviderId;
  integrationId?: string;
  confirm?: () => Promise<boolean>;
  submit: (target: IntegrationDiscoveryTarget) => Promise<Result>;
  apply?: (result: Result) => void | Promise<void>;
  refresh?: boolean;
  fallback: string;
}

interface ActiveMutation {
  kind: IntegrationMutationKind;
  integrationId?: string;
  target: IntegrationDiscoveryTarget;
  generation: number;
}

/**
 * Serializes provider configuration changes across project/provider switches.
 * Navigation invalidates the UI result, not an HTTP mutation already sent.
 * Confirmation is checked again against the original scope before dispatch.
 * Backend authorization and user confirmation remain authoritative.
 */
export function useAgentIntegrationMutations(
  currentTarget: () => IntegrationDiscoveryTarget,
  refresh: () => Promise<void>,
  reportError: (message: string) => void,
) {
  const mutationBusy = ref(false);
  const active = ref<ActiveMutation | null>(null);
  let generation = 0;

  function sameScope(target: IntegrationDiscoveryTarget): boolean {
    const current = currentTarget();
    return (
      current.projectId === target.projectId &&
      current.providerId === target.providerId &&
      current.environmentInstanceId === target.environmentInstanceId
    );
  }

  function resetMutations(): void {
    generation += 1;
    // Do not unlock a request already submitted to the backend.
  }

  const visibleOperation = computed(() => {
    const operation = active.value;
    return operation &&
      operation.generation === generation &&
      sameScope(operation.target)
      ? operation
      : null;
  });

  const installing = computed(
    () => visibleOperation.value?.kind === 'install-mcp',
  );
  const installingIntegrationId = computed(() =>
    visibleOperation.value?.kind === 'install-plugin'
      ? (visibleOperation.value.integrationId ?? null)
      : null,
  );
  const authenticatingIntegrationId = computed(() =>
    visibleOperation.value?.kind === 'authenticate'
      ? (visibleOperation.value.integrationId ?? null)
      : null,
  );
  const togglingIntegrationId = computed(() =>
    visibleOperation.value?.kind === 'toggle'
      ? (visibleOperation.value.integrationId ?? null)
      : null,
  );
  const uninstallingIntegrationId = computed(() =>
    visibleOperation.value?.kind === 'uninstall'
      ? (visibleOperation.value.integrationId ?? null)
      : null,
  );

  async function mutate<Result>(
    options: MutationOptions<Result>,
  ): Promise<void> {
    if (mutationBusy.value) return;
    const target = { ...currentTarget() };
    if (target.providerId !== options.providerId) return;

    const version = generation;
    const current = () => version === generation && sameScope(target);
    mutationBusy.value = true;
    active.value = {
      kind: options.kind,
      ...(options.integrationId
        ? { integrationId: options.integrationId }
        : {}),
      target,
      generation: version,
    };

    try {
      if (options.confirm && !(await options.confirm())) return;
      if (!current()) return;
      const result = await options.submit(target);
      if (!current()) return;
      await options.apply?.(result);
      if (current() && options.refresh !== false) await refresh();
    } catch (error) {
      if (!current()) return;
      // Ambiguous HTTP failures may have committed the change. Re-read the
      // canonical inventory once; never replay the installation/removal.
      if (options.refresh !== false) {
        try {
          await refresh();
        } catch {
          // Preserve the original mutation failure.
        }
      }
      if (current()) {
        reportError(error instanceof Error ? error.message : options.fallback);
      }
    } finally {
      // A stale request cannot release a newer request's lock because
      // mutationBusy prevents another dispatch while it remains in flight.
      mutationBusy.value = false;
      active.value = null;
    }
  }

  return {
    mutationBusy,
    installing,
    installingIntegrationId,
    authenticatingIntegrationId,
    togglingIntegrationId,
    uninstallingIntegrationId,
    resetMutations,
    mutate,
  };
}
