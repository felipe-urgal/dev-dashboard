import { computed, ref, type Ref } from 'vue';

import {
  setAgentExecutionProfiles,
  type AgentCapability,
  type AgentExecutionProfile,
  type AgentExecutionProfileConfiguration,
  type AgentProviderId,
} from '../api/agent-runtime';

interface ExecutionProfilesClient {
  save: typeof setAgentExecutionProfiles;
}

/**
 * Owns profile selection and draft edits for the current project. Requests
 * started before a project change cannot replace the new project's profiles.
 * This is UI state only; the API remains the authority for profile validation.
 */
export function useAgentExecutionProfiles(
  currentProjectId: () => string,
  selectedProviderId: Ref<AgentProviderId>,
  requestedCapabilities: Ref<AgentCapability[]>,
  providerLabel: (providerId: AgentProviderId) => string,
  onInvalid: (message: string) => void,
  client: ExecutionProfilesClient = { save: setAgentExecutionProfiles },
) {
  const executionProfiles = ref<AgentExecutionProfileConfiguration | null>(
    null,
  );
  const selectedProfileId = ref('');
  const profileIdDraft = ref('');
  const profileLabelDraft = ref('');
  const profileTimeoutSeconds = ref('');
  const profileMaxTokens = ref('');
  const profileMaxCost = ref('');
  const profileBudgetMode = ref<'soft' | 'hard'>('soft');
  const profileSaving = ref(false);
  let requestVersion = 0;

  const selectedExecutionProfile = computed(() =>
    executionProfiles.value?.profiles.find(
      (profile) => profile.id === selectedProfileId.value,
    ),
  );

  const effectiveProfileSummary = computed(() => {
    const profile = selectedExecutionProfile.value;
    if (!profile) return 'Sem perfil · configuração manual';
    return [
      profile.label,
      providerLabel(profile.providerId),
      profile.timeoutMs
        ? Math.round(profile.timeoutMs / 1000) + 's'
        : 'sem timeout',
      profile.budget?.mode ? 'budget ' + profile.budget.mode : 'sem budget',
    ].join(' · ');
  });

  function applySelectedProfile(): void {
    const profile = selectedExecutionProfile.value;
    if (!profile) return;
    selectedProviderId.value = profile.providerId;
    requestedCapabilities.value = [...profile.requestedCapabilities];
  }

  function resetExecutionProfiles(): void {
    requestVersion += 1;
    profileSaving.value = false;
    executionProfiles.value = null;
    selectedProfileId.value = '';
    profileIdDraft.value = '';
    profileLabelDraft.value = '';
    profileTimeoutSeconds.value = '';
    profileMaxTokens.value = '';
    profileMaxCost.value = '';
    profileBudgetMode.value = 'soft';
  }

  function setLoadedExecutionProfiles(
    configuration: AgentExecutionProfileConfiguration | null,
    projectId: string,
  ): void {
    if (currentProjectId() !== projectId) return;
    executionProfiles.value = configuration;
    if (
      !selectedProfileId.value ||
      !configuration?.profiles.some(
        (profile) => profile.id === selectedProfileId.value,
      )
    ) {
      selectedProfileId.value = configuration?.defaultProfileId ?? '';
    }
    applySelectedProfile();
  }

  function beginMutation(): { projectId: string; version: number } | null {
    const projectId = currentProjectId();
    if (!projectId || profileSaving.value) return null;
    profileSaving.value = true;
    return { projectId, version: ++requestVersion };
  }

  function isCurrent(request: { projectId: string; version: number }): boolean {
    return (
      request.version === requestVersion &&
      request.projectId === currentProjectId()
    );
  }

  async function settleMutation(
    request: NonNullable<ReturnType<typeof beginMutation>>,
    operation: Promise<AgentExecutionProfileConfiguration>,
    selectedId: string,
  ): Promise<void> {
    try {
      const next = await operation;
      if (!isCurrent(request)) return;
      executionProfiles.value = next;
      selectedProfileId.value = selectedId;
      applySelectedProfile();
    } catch (error) {
      if (isCurrent(request)) throw error;
    } finally {
      if (isCurrent(request)) profileSaving.value = false;
    }
  }

  async function saveCurrentExecutionProfile(): Promise<void> {
    if (profileSaving.value) return;
    const id = profileIdDraft.value.trim().toLowerCase();
    const label = profileLabelDraft.value.trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !label) {
      onInvalid('Informe id simples e nome do perfil.');
      return;
    }
    const request = beginMutation();
    if (!request) return;

    const timeoutSeconds = profileTimeoutSeconds.value.trim()
      ? Number(profileTimeoutSeconds.value)
      : undefined;
    const maxTotalTokens = profileMaxTokens.value.trim()
      ? Number(profileMaxTokens.value)
      : undefined;
    const maxEstimatedCostUsd = profileMaxCost.value.trim()
      ? Number(profileMaxCost.value)
      : undefined;
    const profile: AgentExecutionProfile = {
      id,
      label,
      providerId: selectedProviderId.value,
      ...(selectedProviderId.value === 'automatic'
        ? { fallbackOrder: ['codex', 'claude-code'] }
        : {}),
      ...(timeoutSeconds !== undefined
        ? { timeoutMs: Math.round(timeoutSeconds * 1000) }
        : {}),
      ...(maxTotalTokens !== undefined || maxEstimatedCostUsd !== undefined
        ? {
            budget: {
              ...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
              ...(maxEstimatedCostUsd !== undefined
                ? { maxEstimatedCostUsd }
                : {}),
              mode: profileBudgetMode.value,
            },
          }
        : {}),
      requestedCapabilities: [...requestedCapabilities.value],
    };
    const profiles = [
      ...(executionProfiles.value?.profiles ?? []).filter(
        (candidate) => candidate.id !== id,
      ),
      profile,
    ];
    await settleMutation(
      request,
      client.save(request.projectId, {
        defaultProfileId: executionProfiles.value?.defaultProfileId ?? id,
        profiles,
      }),
      id,
    );
  }

  async function removeSelectedExecutionProfile(): Promise<void> {
    if (!selectedProfileId.value || !executionProfiles.value) return;
    const request = beginMutation();
    if (!request) return;
    const profiles = executionProfiles.value.profiles.filter(
      (profile) => profile.id !== selectedProfileId.value,
    );
    const defaultProfileId =
      executionProfiles.value.defaultProfileId === selectedProfileId.value
        ? profiles[0]?.id
        : executionProfiles.value.defaultProfileId;
    await settleMutation(
      request,
      client.save(request.projectId, {
        ...(defaultProfileId ? { defaultProfileId } : {}),
        profiles,
      }),
      defaultProfileId ?? '',
    );
  }

  return {
    executionProfiles,
    selectedProfileId,
    profileIdDraft,
    profileLabelDraft,
    profileTimeoutSeconds,
    profileMaxTokens,
    profileMaxCost,
    profileBudgetMode,
    profileSaving,
    selectedExecutionProfile,
    effectiveProfileSummary,
    resetExecutionProfiles,
    setLoadedExecutionProfiles,
    applySelectedProfile,
    saveCurrentExecutionProfile,
    removeSelectedExecutionProfile,
  };
}
