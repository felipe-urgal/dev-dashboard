import { ref } from 'vue';

import {
  fetchAgentIntegrationCapabilities,
  fetchAgentIntegrations,
  type AgentConcreteProviderId,
  type AgentIntegration,
  type AgentIntegrationProviderCapabilities,
} from '../api/agent-runtime';

export interface IntegrationDiscoveryTarget {
  projectId: string;
  providerId: AgentConcreteProviderId;
  environmentInstanceId?: string | undefined;
}

interface DiscoveryClient {
  capabilities: typeof fetchAgentIntegrationCapabilities;
  integrations: typeof fetchAgentIntegrations;
}

/**
 * Scoped integration discovery. Every response, including errors, must match
 * both the selected project/provider/environment and the generation of the
 * request. Generation rejects A → B → A responses after navigation.
 *
 * This state is observational and must not be used as an authorization grant.
 */
export function useAgentIntegrationDiscovery(
  currentTarget: () => IntegrationDiscoveryTarget,
  client: DiscoveryClient = {
    capabilities: fetchAgentIntegrationCapabilities,
    integrations: fetchAgentIntegrations,
  },
) {
  const capabilities = ref<AgentIntegrationProviderCapabilities[]>([]);
  const integrations = ref<AgentIntegration[]>([]);
  const integrationIssues = ref<string[]>([]);
  const loading = ref(false);
  const errorMessage = ref('');
  let generation = 0;
  let requestId = 0;

  function captureScope(): IntegrationDiscoveryTarget & { generation: number } {
    return { ...currentTarget(), generation };
  }

  function isCurrentScope(
    scope: IntegrationDiscoveryTarget & { generation: number },
  ): boolean {
    const current = currentTarget();
    return (
      scope.generation === generation &&
      scope.projectId === current.projectId &&
      scope.providerId === current.providerId &&
      scope.environmentInstanceId === current.environmentInstanceId
    );
  }

  function resetDiscovery(): void {
    generation += 1;
    capabilities.value = [];
    integrations.value = [];
    integrationIssues.value = [];
    loading.value = false;
    errorMessage.value = '';
  }

  async function load(): Promise<void> {
    const scope = captureScope();
    const request = ++requestId;
    const current = () => isCurrentScope(scope) && request === requestId;
    loading.value = true;
    errorMessage.value = '';

    try {
      const nextCapabilities = await client.capabilities();
      if (!current()) return;
      capabilities.value = nextCapabilities;
      try {
        const discovery = await client.integrations(
          scope.projectId,
          scope.providerId,
          scope.environmentInstanceId,
        );
        if (!current()) return;
        integrations.value = discovery.integrations;
        integrationIssues.value = discovery.issues.map(
          (issue) => issue.message,
        );
      } catch (error) {
        if (!current()) return;
        integrations.value = [];
        integrationIssues.value = [];
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'A descoberta de integrações não está disponível para este provider.';
      }
    } catch (error) {
      if (!current()) return;
      capabilities.value = [];
      integrations.value = [];
      integrationIssues.value = [];
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as integrações do Agente.';
    } finally {
      if (current()) loading.value = false;
    }
  }

  return {
    capabilities,
    integrations,
    integrationIssues,
    loading,
    errorMessage,
    captureScope,
    isCurrentScope,
    resetDiscovery,
    load,
  };
}
