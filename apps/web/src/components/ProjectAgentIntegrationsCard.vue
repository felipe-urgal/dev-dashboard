<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowPathIcon, PuzzlePieceIcon } from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchAgentIntegrationCapabilities,
  fetchAgentIntegrations,
  type AgentConcreteProviderId,
  type AgentIntegration,
  type AgentIntegrationProviderCapabilities,
} from '../api/agent-runtime';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string;
}>();

const providerIds: AgentConcreteProviderId[] = [
  'codex',
  'claude-code',
  'chatgpt-browser',
];

const selectedProviderId = ref<AgentConcreteProviderId>('codex');
const capabilities = ref<AgentIntegrationProviderCapabilities[]>([]);
const integrations = ref<AgentIntegration[]>([]);
const loading = ref(false);
const errorMessage = ref('');

const selectedCapabilities = computed(
  () =>
    capabilities.value.find(
      (provider) => provider.providerId === selectedProviderId.value,
    ) ?? null,
);

const providerLabel = (providerId: AgentConcreteProviderId): string => {
  switch (providerId) {
    case 'codex':
      return 'Codex';
    case 'claude-code':
      return 'Claude Code';
    case 'chatgpt-browser':
      return 'ChatGPT Browser';
  }
};

const integrationKindLabel = (kind: AgentIntegration['kind']): string => {
  switch (kind) {
    case 'mcp-server':
      return 'MCP';
    case 'skill':
      return 'Skill';
    case 'plugin':
      return 'Plugin';
    case 'browser-capability':
      return 'Browser';
  }
};

const authLabel = (integration: AgentIntegration): string => {
  switch (integration.authStatus) {
    case 'authenticated':
      return 'Autenticado';
    case 'unauthenticated':
      return 'Sem autenticação';
    case 'unsupported':
      return 'Sem auth';
    case 'unknown':
      return 'Auth desconhecida';
    default:
      return 'Auth não informada';
  }
};

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';

  try {
    capabilities.value = await fetchAgentIntegrationCapabilities();
    try {
      integrations.value = await fetchAgentIntegrations(
        props.project.id,
        selectedProviderId.value,
        props.environmentInstanceId,
      );
    } catch (error) {
      integrations.value = [];
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'A descoberta de integrações não está disponível para este provider.';
    }
  } catch (error) {
    capabilities.value = [];
    integrations.value = [];
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar as integrações do Agente.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => [
    props.project.id,
    props.environmentInstanceId,
    selectedProviderId.value,
  ],
  () => {
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section class="agent-integrations-card agent-card" aria-label="Integrações do Agente">
    <div class="agent-section-heading">
      <div>
        <span>Integrações</span>
        <strong>MCP, skills e plugins</strong>
      </div>
      <button
        class="agent-icon-button"
        type="button"
        aria-label="Atualizar integrações"
        :disabled="loading"
        @click="load"
      >
        <ArrowPathIcon aria-hidden="true" />
      </button>
    </div>

    <div class="agent-integrations-provider-tabs" role="tablist" aria-label="Provider">
      <button
        v-for="providerId in providerIds"
        :key="providerId"
        type="button"
        :class="{ active: selectedProviderId === providerId }"
        @click="selectedProviderId = providerId"
      >
        {{ providerLabel(providerId) }}
      </button>
    </div>

    <div v-if="selectedCapabilities" class="agent-integrations-capabilities">
      <div
        v-for="capability in selectedCapabilities.integrations"
        :key="capability.kind"
        class="agent-integration-capability"
      >
        <div>
          <strong>{{ integrationKindLabel(capability.kind) }}</strong>
          <small>{{ capability.scopes.join(' · ') || 'Sem escopo' }}</small>
        </div>
        <StatusBadge
          :tone="capability.availability === 'supported' ? 'success' : 'neutral'"
        >
          {{
            capability.availability === 'supported'
              ? capability.operations.join(' · ') || 'Disponível'
              : 'Indisponível'
          }}
        </StatusBadge>
        <p v-if="capability.reason">{{ capability.reason }}</p>
      </div>
    </div>

    <div class="agent-integrations-list">
      <div class="agent-integrations-list-heading">
        <span>Descoberta atual</span>
        <small v-if="loading">Atualizando…</small>
        <small v-else>{{ integrations.length }} item(ns)</small>
      </div>

      <div v-if="integrations.length" class="agent-integrations-items">
        <article
          v-for="integration in integrations"
          :key="integration.id"
          class="agent-integration-item"
        >
          <PuzzlePieceIcon aria-hidden="true" />
          <div>
            <strong>{{ integration.name }}</strong>
            <small>
              {{ integrationKindLabel(integration.kind) }}
              ·
              {{
                integration.enabled === undefined
                  ? 'Estado não informado'
                  : integration.enabled
                    ? 'Ativo'
                    : 'Desativado'
              }}
              · {{ authLabel(integration) }}
            </small>
          </div>
        </article>
      </div>

      <p v-else-if="!loading && !errorMessage" class="agent-hint">
        Nenhuma integração encontrada para este provider.
      </p>
      <p v-if="errorMessage" class="agent-integrations-warning">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.agent-integrations-card {
  display: grid;
  gap: 12px;
}

.agent-integrations-provider-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-integrations-provider-tabs button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-0);
  font: inherit;
  font-size: var(--font-xs);
  cursor: pointer;
}

.agent-integrations-provider-tabs button:hover,
.agent-integrations-provider-tabs button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.agent-integrations-capabilities,
.agent-integrations-list,
.agent-integrations-items {
  display: grid;
  gap: 8px;
}

.agent-integration-capability,
.agent-integration-item {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-integration-capability {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.agent-integration-capability > div,
.agent-integration-item > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-integration-capability strong,
.agent-integration-item strong {
  overflow: hidden;
  font-size: var(--font-xs);
  text-overflow: ellipsis;
}

.agent-integration-capability small,
.agent-integration-item small,
.agent-integrations-list-heading,
.agent-integration-capability p {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-integration-capability p {
  grid-column: 1 / -1;
  margin: 0;
  line-height: 1.45;
}

.agent-integrations-list {
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

.agent-integrations-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-transform: uppercase;
}

.agent-integration-item {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}

.agent-integration-item svg {
  width: 17px;
  height: 17px;
  color: var(--text-dim);
}

.agent-integrations-warning {
  margin: 0;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-0);
  font-size: var(--font-xs);
  line-height: 1.45;
}
</style>
