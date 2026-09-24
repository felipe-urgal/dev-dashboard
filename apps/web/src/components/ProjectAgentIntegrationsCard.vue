<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowPathIcon, PuzzlePieceIcon } from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchAgentIntegrationCapabilities,
  fetchAgentIntegrationDetails,
  fetchAgentIntegrations,
  installAgentIntegration,
  setAgentIntegrationEnabled,
  uninstallAgentIntegration,
  type AgentConcreteProviderId,
  type AgentIntegration,
  type AgentIntegrationDetails,
  type AgentIntegrationProviderCapabilities,
} from '../api/agent-runtime';
import { confirmDialog } from '../stores/app-dialog';
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
const integrationIssues = ref<string[]>([]);
const loading = ref(false);
const installing = ref(false);
const errorMessage = ref('');
const installName = ref('');
const installUrl = ref('');
const installConfirmed = ref(false);
const integrationDetails = ref<Record<string, AgentIntegrationDetails>>({});
const expandedIntegrationId = ref<string | null>(null);
const inspectingIntegrationId = ref<string | null>(null);
const togglingIntegrationId = ref<string | null>(null);
const uninstallingIntegrationId = ref<string | null>(null);

const selectedCapabilities = computed(
  () =>
    capabilities.value.find(
      (provider) => provider.providerId === selectedProviderId.value,
    ) ?? null,
);

const canInspectSelectedProvider = computed(
  () =>
    selectedCapabilities.value?.integrations.some(
      (capability) =>
        capability.kind === 'mcp-server' &&
        capability.operations.includes('inspect'),
    ) ?? false,
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

const capabilityScopeLabel = (scope: string): string => {
  switch (scope) {
    case 'user':
      return 'Usuário global';
    case 'project':
      return 'Projeto';
    case 'local':
      return 'Local';
    case 'managed':
      return 'Gerenciado';
    case 'session':
      return 'Sessão';
    default:
      return scope;
  }
};

const integrationScopeLabel = (integration: AgentIntegration): string => {
  switch (integration.scope) {
    case 'user':
      return 'Usuário global';
    case 'project':
      return 'Projeto';
    case 'local':
      return 'Local';
    case 'managed':
      return 'Gerenciado';
    case 'session':
      return 'Sessão';
    default:
      return 'Escopo não informado';
  }
};

const integrationOriginLabel = (integration: AgentIntegration): string => {
  switch (integration.origin) {
    case 'codex-global-config':
      return 'Configuração global do Codex';
    case 'claude-plugin-inventory':
      return 'Inventário de plugins do Claude Code';
    case 'browser-local-allowlist':
      return 'Allowlist local do Browser';
    default:
      return 'Origem não informada';
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

const canToggleIntegration = (integration: AgentIntegration): boolean =>
  integration.providerId === 'claude-code' &&
  integration.kind === 'plugin' &&
  Boolean(integration.marketplace) &&
  (integration.scope === 'user' ||
    integration.scope === 'project' ||
    integration.scope === 'local') &&
  typeof integration.enabled === 'boolean';

async function toggleIntegration(integration: AgentIntegration): Promise<void> {
  if (
    !canToggleIntegration(integration) ||
    !integration.marketplace ||
    !integration.scope ||
    integration.enabled === undefined ||
    togglingIntegrationId.value
  ) {
    return;
  }

  togglingIntegrationId.value = integration.id;
  errorMessage.value = '';
  try {
    const updated = await setAgentIntegrationEnabled(props.project.id, {
      providerId: 'claude-code',
      ...(props.environmentInstanceId
        ? { environmentInstanceId: props.environmentInstanceId }
        : {}),
      kind: 'plugin',
      name: integration.name,
      marketplace: integration.marketplace,
      scope: integration.scope,
      enabled: !integration.enabled,
    });
    const current = integrations.value.find(
      (item) => item.id === integration.id,
    );
    if (current && updated.enabled !== undefined) {
      current.enabled = updated.enabled;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível alterar o estado do plugin.';
  } finally {
    togglingIntegrationId.value = null;
  }
}

async function uninstallIntegration(
  integration: AgentIntegration,
): Promise<void> {
  if (
    !canToggleIntegration(integration) ||
    !integration.marketplace ||
    !integration.scope ||
    uninstallingIntegrationId.value
  ) {
    return;
  }

  const confirmed = await confirmDialog({
    title: 'Remover plugin',
    message:
      'Remover ' +
      integration.name +
      ' do escopo ' +
      integrationScopeLabel(integration) +
      '? Os dados persistentes do plugin serão preservados.',
    confirmLabel: 'Remover plugin',
    cancelLabel: 'Cancelar',
    tone: 'danger',
  });
  if (!confirmed) return;

  uninstallingIntegrationId.value = integration.id;
  errorMessage.value = '';
  try {
    await uninstallAgentIntegration(props.project.id, {
      providerId: 'claude-code',
      ...(props.environmentInstanceId
        ? { environmentInstanceId: props.environmentInstanceId }
        : {}),
      kind: 'plugin',
      name: integration.name,
      marketplace: integration.marketplace,
      scope: integration.scope,
      confirmed: true,
    });
    integrations.value = integrations.value.filter(
      (item) => item.id !== integration.id,
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover o plugin.';
  } finally {
    uninstallingIntegrationId.value = null;
  }
}

async function inspectIntegration(
  integration: AgentIntegration,
): Promise<void> {
  if (!canInspectSelectedProvider.value) return;

  if (expandedIntegrationId.value === integration.id) {
    expandedIntegrationId.value = null;
    return;
  }

  expandedIntegrationId.value = integration.id;
  if (integrationDetails.value[integration.id]) return;

  inspectingIntegrationId.value = integration.id;
  errorMessage.value = '';
  try {
    integrationDetails.value[integration.id] =
      await fetchAgentIntegrationDetails(
        props.project.id,
        integration.providerId,
        integration.kind,
        integration.name,
        props.environmentInstanceId,
      );
  } catch (error) {
    expandedIntegrationId.value = null;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os detalhes da integração.';
  } finally {
    inspectingIntegrationId.value = null;
  }
}

async function installCodexMcp(): Promise<void> {
  if (
    selectedProviderId.value !== 'codex' ||
    installing.value ||
    !installConfirmed.value ||
    !installName.value.trim() ||
    !installUrl.value.trim()
  ) {
    return;
  }

  installing.value = true;
  errorMessage.value = '';
  try {
    await installAgentIntegration(props.project.id, {
      providerId: 'codex',
      ...(props.environmentInstanceId
        ? { environmentInstanceId: props.environmentInstanceId }
        : {}),
      kind: 'mcp-server',
      name: installName.value.trim(),
      scope: 'user',
      confirmed: true,
      url: installUrl.value.trim(),
    });
    installName.value = '';
    installUrl.value = '';
    installConfirmed.value = false;
    const discovery = await fetchAgentIntegrations(
      props.project.id,
      'codex',
      props.environmentInstanceId,
    );
    integrations.value = discovery.integrations;
    integrationIssues.value = discovery.issues.map((issue) => issue.message);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível adicionar o MCP do Codex.';
  } finally {
    installing.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';

  try {
    capabilities.value = await fetchAgentIntegrationCapabilities();
    try {
      const discovery = await fetchAgentIntegrations(
        props.project.id,
        selectedProviderId.value,
        props.environmentInstanceId,
      );
      integrations.value = discovery.integrations;
      integrationIssues.value = discovery.issues.map((issue) => issue.message);
    } catch (error) {
      integrations.value = [];
      integrationIssues.value = [];
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'A descoberta de integrações não está disponível para este provider.';
    }
  } catch (error) {
    capabilities.value = [];
    integrations.value = [];
    integrationIssues.value = [];
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
  <section
    class="agent-integrations-card agent-card"
    aria-label="Integrações do Agente"
  >
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

    <div
      class="agent-integrations-provider-tabs"
      role="tablist"
      aria-label="Provider"
    >
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
          <small>
            {{
              capability.scopes.map(capabilityScopeLabel).join(' · ') ||
              'Sem escopo'
            }}
          </small>
        </div>
        <StatusBadge
          :tone="
            capability.availability === 'supported' ? 'success' : 'neutral'
          "
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

    <form
      v-if="selectedProviderId === 'codex'"
      class="agent-integration-install"
      @submit.prevent="installCodexMcp"
    >
      <div class="agent-integrations-list-heading">
        <span>Adicionar MCP remoto</span>
        <small>Escopo global do usuário</small>
      </div>
      <label>
        <span>Nome</span>
        <input
          v-model="installName"
          type="text"
          maxlength="64"
          placeholder="openaiDeveloperDocs"
          :disabled="installing"
        />
      </label>
      <label>
        <span>URL HTTPS</span>
        <input
          v-model="installUrl"
          type="url"
          maxlength="2048"
          placeholder="https://example.com/mcp"
          :disabled="installing"
        />
      </label>
      <label class="agent-integration-confirmation">
        <input
          v-model="installConfirmed"
          type="checkbox"
          :disabled="installing"
        />
        <span>
          Confirmo que este MCP será adicionado à configuração compartilhada do
          meu usuário Codex.
        </span>
      </label>
      <div class="agent-integration-install-actions">
        <p>
          O dashboard envia apenas nome e URL ao backend. Comandos, argumentos e
          variáveis de ambiente não são aceitos por este formulário.
        </p>
        <button
          class="secondary-button"
          type="submit"
          :disabled="
            installing ||
            !installConfirmed ||
            !installName.trim() ||
            !installUrl.trim()
          "
        >
          {{ installing ? 'Adicionando…' : 'Adicionar MCP' }}
        </button>
      </div>
    </form>

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
            <small class="agent-integration-provenance">
              {{ integrationScopeLabel(integration) }}
              · {{ integrationOriginLabel(integration) }}
              <template v-if="integration.marketplace">
                · Marketplace: {{ integration.marketplace }}
              </template>
              <template v-if="integration.version">
                · v{{ integration.version }}
              </template>
            </small>
          </div>
          <div
            v-if="
              (canInspectSelectedProvider &&
                integration.kind === 'mcp-server') ||
              canToggleIntegration(integration)
            "
            class="agent-integration-actions"
          >
            <button
              v-if="
                canInspectSelectedProvider && integration.kind === 'mcp-server'
              "
              class="agent-integration-details-button"
              type="button"
              :disabled="inspectingIntegrationId === integration.id"
              @click="inspectIntegration(integration)"
            >
              {{
                inspectingIntegrationId === integration.id
                  ? 'Carregando…'
                  : expandedIntegrationId === integration.id
                    ? 'Ocultar'
                    : 'Detalhes'
              }}
            </button>
            <button
              v-if="canToggleIntegration(integration)"
              class="agent-integration-details-button"
              type="button"
              :disabled="
                togglingIntegrationId === integration.id ||
                uninstallingIntegrationId === integration.id
              "
              @click="toggleIntegration(integration)"
            >
              {{
                togglingIntegrationId === integration.id
                  ? 'Aplicando…'
                  : integration.enabled
                    ? 'Desativar'
                    : 'Ativar'
              }}
            </button>
            <button
              v-if="canToggleIntegration(integration)"
              class="agent-integration-details-button"
              type="button"
              :disabled="
                uninstallingIntegrationId === integration.id ||
                togglingIntegrationId === integration.id
              "
              @click="uninstallIntegration(integration)"
            >
              {{
                uninstallingIntegrationId === integration.id
                  ? 'Removendo…'
                  : 'Remover'
              }}
            </button>
          </div>
          <div
            v-if="
              expandedIntegrationId === integration.id &&
              integrationDetails[integration.id]
            "
            class="agent-integration-details"
          >
            <span v-if="integrationDetails[integration.id]?.transportType">
              Transporte:
              <strong>{{
                integrationDetails[integration.id]?.transportType
              }}</strong>
            </span>
            <span v-if="integrationDetails[integration.id]?.enabledTools">
              Tools permitidas:
              <strong>
                {{
                  integrationDetails[integration.id]?.enabledTools?.join(
                    ', ',
                  ) || 'nenhuma'
                }}
              </strong>
            </span>
            <span v-if="integrationDetails[integration.id]?.disabledTools">
              Tools bloqueadas:
              <strong>
                {{
                  integrationDetails[integration.id]?.disabledTools?.join(
                    ', ',
                  ) || 'nenhuma'
                }}
              </strong>
            </span>
            <span
              v-if="
                integrationDetails[integration.id]?.startupTimeoutSec !==
                undefined
              "
            >
              Startup timeout:
              <strong>
                {{ integrationDetails[integration.id]?.startupTimeoutSec }}s
              </strong>
            </span>
            <span
              v-if="
                integrationDetails[integration.id]?.toolTimeoutSec !== undefined
              "
            >
              Tool timeout:
              <strong>
                {{ integrationDetails[integration.id]?.toolTimeoutSec }}s
              </strong>
            </span>
          </div>
        </article>
      </div>

      <p v-else-if="!loading && !errorMessage" class="agent-hint">
        Nenhuma integração encontrada para este provider.
      </p>

      <div v-if="integrationIssues.length" class="agent-integrations-warning">
        <strong>Descoberta parcial</strong>
        <span>
          {{ integrationIssues.length }}
          {{
            integrationIssues.length === 1
              ? 'entrada foi ignorada'
              : 'entradas foram ignoradas'
          }}
          por resposta inválida do provider.
        </span>
      </div>

      <p v-if="errorMessage" class="agent-integrations-warning">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.agent-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.agent-section-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-section-heading > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-section-heading span {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.agent-section-heading strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-sm);
  text-overflow: ellipsis;
}

.agent-icon-button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.agent-icon-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.agent-icon-button svg {
  width: 15px;
  height: 15px;
}

.agent-hint {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--font-xs);
  line-height: 1.45;
}

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

.agent-integration-install {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-integration-install > label:not(.agent-integration-confirmation) {
  display: grid;
  gap: 5px;
}

.agent-integration-install label > span {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.agent-integration-install input[type='text'],
.agent-integration-install input[type='url'] {
  min-height: 34px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-1);
  font: inherit;
  font-size: var(--font-xs);
}

.agent-integration-confirmation {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.agent-integration-confirmation span {
  font-weight: normal;
  line-height: 1.45;
}

.agent-integration-install-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-integration-install-actions p {
  max-width: 620px;
  margin: 0;
  color: var(--text-dim);
  font-size: 9px;
  line-height: 1.45;
}

.agent-integration-install-actions button {
  flex: 0 0 auto;
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
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
}

.agent-integration-provenance {
  margin-top: 2px;
  color: var(--text-dim);
}

.agent-integration-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.agent-integration-details-button {
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 9px;
  cursor: pointer;
}

.agent-integration-details-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.agent-integration-details {
  display: grid;
  grid-column: 1 / -1;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 9px;
}

.agent-integration-details strong {
  color: var(--text-muted);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
}

.agent-integration-item svg {
  width: 17px;
  height: 17px;
  color: var(--text-dim);
}

.agent-integrations-warning {
  display: grid;
  gap: 2px;
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
