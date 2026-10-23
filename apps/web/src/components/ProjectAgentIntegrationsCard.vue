<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowPathIcon, PuzzlePieceIcon } from '@heroicons/vue/24/outline';
import { RouterLink } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchAgentIntegrationDetails,
  installAgentIntegration,
  prepareAgentIntegrationAuthentication,
  setAgentIntegrationEnabled,
  uninstallAgentIntegration,
  type AgentConcreteProviderId,
  type AgentIntegration,
  type AgentIntegrationDetails,
} from '../api/agent-runtime';
import { useAgentIntegrationDiscovery } from '../composables/useAgentIntegrationDiscovery';
import { useAgentIntegrationMutations } from '../composables/useAgentIntegrationMutations';
import { confirmDialog } from '../stores/app-dialog';
import { copyTextToClipboard } from '../utils/terminal-clipboard';
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

type IntegrationView = 'all' | 'installed' | 'available';
type ClaudeMutableScope = 'user' | 'project' | 'local';

const selectedProviderId = ref<AgentConcreteProviderId>('codex');
const selectedIntegrationView = ref<IntegrationView>('all');
const claudePluginInstallScope = ref<ClaudeMutableScope>('local');
const claudeMcpInstallScope = ref<ClaudeMutableScope>('local');
const {
  capabilities,
  integrations,
  integrationIssues,
  loading,
  errorMessage,
  captureScope,
  isCurrentScope,
  resetDiscovery,
  load,
} = useAgentIntegrationDiscovery(() => ({
  projectId: props.project.id,
  providerId: selectedProviderId.value,
  environmentInstanceId: props.environmentInstanceId,
}));
const installName = ref('');
const installUrl = ref('');
const installConfirmed = ref(false);
const integrationDetails = ref<Record<string, AgentIntegrationDetails>>({});
const expandedIntegrationId = ref<string | null>(null);
const inspectingIntegrationId = ref<string | null>(null);
const authenticationHandoff = ref<{
  integrationId: string;
  providerId: AgentConcreteProviderId;
  command: string;
  copied: boolean;
} | null>(null);
const {
  mutationBusy,
  installing,
  installingIntegrationId,
  authenticatingIntegrationId,
  togglingIntegrationId,
  uninstallingIntegrationId,
  resetMutations,
  mutate,
} = useAgentIntegrationMutations(
  () => captureScope(),
  load,
  (message) => { errorMessage.value = message; },
);

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

const canAuthenticateSelectedProvider = computed(
  () =>
    selectedCapabilities.value?.integrations.some(
      (capability) =>
        capability.kind === 'mcp-server' &&
        capability.operations.includes('authenticate'),
    ) ?? false,
);

const isAvailableIntegration = (integration: AgentIntegration): boolean =>
  integration.origin === 'claude-plugin-catalog';

const availableIntegrationCount = computed(
  () => integrations.value.filter(isAvailableIntegration).length,
);

const installedIntegrationCount = computed(
  () => integrations.value.length - availableIntegrationCount.value,
);

const showIntegrationViewFilters = computed(
  () =>
    selectedProviderId.value === 'claude-code' &&
    availableIntegrationCount.value > 0,
);

const filteredIntegrations = computed(() => {
  switch (selectedIntegrationView.value) {
    case 'installed':
      return integrations.value.filter(
        (integration) => !isAvailableIntegration(integration),
      );
    case 'available':
      return integrations.value.filter(isAvailableIntegration);
    default:
      return integrations.value;
  }
});

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
    case 'marketplace':
      return 'Marketplace';
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
    case 'claude-mcp-config':
      return 'Configuração MCP do Claude Code';
    case 'claude-plugin-inventory':
      return 'Inventário de plugins do Claude Code';
    case 'claude-plugin-catalog':
      return 'Catálogo de plugins do Claude Code';
    case 'claude-marketplace-inventory':
      return 'Marketplaces do Claude Code';
    case 'browser-local-allowlist':
      return 'Allowlist local do Browser';
    default:
      return 'Origem não informada';
  }
};

const marketplaceSourceLabel = (integration: AgentIntegration): string => {
  switch (integration.marketplaceSource) {
    case 'github':
      return 'GitHub';
    case 'git':
      return 'Git';
    case 'url':
      return 'URL remota';
    case 'local':
      return 'Local';
    case 'claude-ai':
      return 'claude.ai';
    default:
      return 'Fonte não informada';
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

const canInstallIntegration = (integration: AgentIntegration): boolean =>
  integration.providerId === 'claude-code' &&
  integration.kind === 'plugin' &&
  integration.origin === 'claude-plugin-catalog' &&
  Boolean(integration.marketplace);

const canAuthenticateIntegration = (integration: AgentIntegration): boolean => {
  if (
    !canAuthenticateSelectedProvider.value ||
    integration.kind !== 'mcp-server'
  ) {
    return false;
  }
  if (integration.providerId === 'codex') return true;
  return (
    integration.providerId === 'claude-code' &&
    (integration.scope === 'local' ||
      integration.scope === 'project' ||
      integration.scope === 'user')
  );
};

const canToggleIntegration = (integration: AgentIntegration): boolean =>
  integration.providerId === 'claude-code' &&
  integration.kind === 'plugin' &&
  Boolean(integration.marketplace) &&
  (integration.scope === 'user' ||
    integration.scope === 'project' ||
    integration.scope === 'local') &&
  typeof integration.enabled === 'boolean';

const canUninstallIntegration = (integration: AgentIntegration): boolean =>
  (integration.providerId === 'codex' && integration.kind === 'mcp-server') ||
  (integration.providerId === 'claude-code' &&
    integration.kind === 'mcp-server' &&
    (integration.scope === 'local' ||
      integration.scope === 'project' ||
      integration.scope === 'user')) ||
  canToggleIntegration(integration);

async function installClaudePlugin(integration: AgentIntegration): Promise<void> {
  if (!canInstallIntegration(integration)) return;
  const entry = { ...integration };
  const scope = claudePluginInstallScope.value;
  const label = capabilityScopeLabel(scope);
  await mutate({
    kind: 'install-plugin',
    providerId: entry.providerId,
    integrationId: entry.id,
    fallback: 'Não foi possível instalar o plugin do Claude Code.',
    confirm: () => confirmDialog({
      title: 'Instalar plugin do Claude Code',
      message:
        'Instalar ' + entry.name + '@' + entry.marketplace +
        ' no escopo ' + label +
        '? Plugins podem incluir skills, agents, hooks, MCP servers e LSP. Comandos declarados pelo marketplace não serão aceitos automaticamente.',
      confirmLabel: 'Instalar plugin',
      cancelLabel: 'Cancelar',
      tone: 'warning',
    }),
    submit: (target) => installAgentIntegration(target.projectId, {
      providerId: 'claude-code',
      ...(target.environmentInstanceId
        ? { environmentInstanceId: target.environmentInstanceId }
        : {}),
      kind: 'plugin',
      name: entry.name,
      marketplace: entry.marketplace,
      scope,
      confirmed: true,
    }),
  });
}

async function prepareAuthentication(integration: AgentIntegration): Promise<void> {
  if (
    !canAuthenticateIntegration(integration) ||
    (integration.providerId === 'claude-code' && !integration.scope)
  ) return;
  const entry = { ...integration };
  await mutate({
    kind: 'authenticate',
    providerId: entry.providerId,
    integrationId: entry.id,
    fallback: 'Não foi possível preparar a autenticação do MCP.',
    refresh: false,
    submit: (target) => prepareAgentIntegrationAuthentication(
      target.projectId,
      {
        providerId: entry.providerId,
        ...(target.environmentInstanceId
          ? { environmentInstanceId: target.environmentInstanceId }
          : {}),
        kind: 'mcp-server',
        name: entry.name,
        ...(entry.scope ? { scope: entry.scope } : {}),
      },
    ),
    apply: (handoff) => {
      authenticationHandoff.value = {
        integrationId: entry.id,
        providerId: handoff.providerId,
        command: [handoff.program, ...handoff.args].join(' '),
        copied: false,
      };
    },
  });
}

async function copyAuthenticationCommand(): Promise<void> {
  const handoff = authenticationHandoff.value;
  if (!handoff) return;
  const scope = captureScope();
  const copied = await copyTextToClipboard(handoff.command);
  if (!isCurrentScope(scope) || authenticationHandoff.value !== handoff) return;
  if (!copied) {
    errorMessage.value = 'Não foi possível copiar o comando de autenticação.';
    return;
  }
  handoff.copied = true;
}

async function toggleIntegration(integration: AgentIntegration): Promise<void> {
  if (!canToggleIntegration(integration)) return;
  const entry = { ...integration };
  await mutate({
    kind: 'toggle',
    providerId: entry.providerId,
    integrationId: entry.id,
    fallback: 'Não foi possível alterar o estado do plugin.',
    submit: (target) => setAgentIntegrationEnabled(target.projectId, {
      providerId: 'claude-code',
      ...(target.environmentInstanceId
        ? { environmentInstanceId: target.environmentInstanceId }
        : {}),
      kind: 'plugin',
      name: entry.name,
      ...(entry.marketplace ? { marketplace: entry.marketplace } : {}),
      scope: entry.scope!,
      enabled: !entry.enabled,
    }),
  });
}

async function uninstallIntegration(integration: AgentIntegration): Promise<void> {
  if (!canUninstallIntegration(integration)) return;
  const entry = { ...integration };
  const isCodex = entry.providerId === 'codex';
  const isMcp = entry.kind === 'mcp-server';
  const confirmOptions = isCodex
    ? {
        title: 'Remover MCP global do Codex',
        message: 'Remover a entrada global do usuário para ' +
          entry.name +
          '? Se este MCP também estiver configurado no projeto, ele continuará listado.',
        confirmLabel: 'Remover MCP global',
      }
    : isMcp
      ? {
          title: 'Remover MCP do Claude Code',
          message: 'Remover ' + entry.name + ' do escopo ' +
            integrationScopeLabel(entry) +
            '? Para servidores remotos, o Claude Code também pode remover credenciais OAuth armazenadas para este servidor.',
          confirmLabel: 'Remover MCP',
        }
      : {
          title: 'Remover plugin',
          message: 'Remover ' + entry.name + ' do escopo ' +
            integrationScopeLabel(entry) +
            '? Os dados persistentes do plugin serão preservados.',
          confirmLabel: 'Remover plugin',
        };
  if (!isCodex && !entry.scope) return;
  await mutate({
    kind: 'uninstall',
    providerId: entry.providerId,
    integrationId: entry.id,
    fallback: isCodex
      ? 'Não foi possível remover o MCP global do Codex.'
      : isMcp
        ? 'Não foi possível remover o MCP do Claude Code.'
        : 'Não foi possível remover o plugin.',
    confirm: () => confirmDialog({
      ...confirmOptions,
      cancelLabel: 'Cancelar',
      tone: 'danger',
    }),
    submit: (target) => uninstallAgentIntegration(target.projectId, {
      providerId: entry.providerId,
      ...(target.environmentInstanceId
        ? { environmentInstanceId: target.environmentInstanceId }
        : {}),
      kind: entry.kind,
      name: entry.name,
      ...(entry.marketplace ? { marketplace: entry.marketplace } : {}),
      scope: isCodex ? 'user' : entry.scope!,
      confirmed: true,
    }),
  });
}

async function inspectIntegration(
  integration: AgentIntegration,
): Promise<void> {
  if (
    !canInspectSelectedProvider.value ||
    integration.providerId !== selectedProviderId.value
  )
    return;
  const scope = captureScope();

  if (expandedIntegrationId.value === integration.id) {
    expandedIntegrationId.value = null;
    return;
  }

  expandedIntegrationId.value = integration.id;
  if (integrationDetails.value[integration.id]) return;

  inspectingIntegrationId.value = integration.id;
  errorMessage.value = '';
  try {
    const details = await fetchAgentIntegrationDetails(
      scope.projectId,
      integration.providerId,
      integration.kind,
      integration.name,
      scope.environmentInstanceId,
    );
    if (
      !isCurrentScope(scope) ||
      expandedIntegrationId.value !== integration.id
    )
      return;
    integrationDetails.value[integration.id] = details;
  } catch (error) {
    if (
      !isCurrentScope(scope) ||
      expandedIntegrationId.value !== integration.id
    )
      return;
    expandedIntegrationId.value = null;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os detalhes da integração.';
  } finally {
    if (
      isCurrentScope(scope) &&
      inspectingIntegrationId.value === integration.id
    ) {
      inspectingIntegrationId.value = null;
    }
  }
}

async function installMcp(): Promise<void> {
  const providerId = selectedProviderId.value;
  if (
    (providerId !== 'codex' && providerId !== 'claude-code') ||
    mutationBusy.value ||
    !installConfirmed.value ||
    !installName.value.trim() ||
    !installUrl.value.trim()
  ) return;

  // Values must be immutable before the first await. A project switch after
  // the confirmation cannot redirect the request to the newly selected target.
  const name = installName.value.trim();
  const url = installUrl.value.trim();
  const scope = providerId === 'codex' ? 'user' : claudeMcpInstallScope.value;
  await mutate({
    kind: 'install-mcp',
    providerId,
    fallback: providerId === 'codex'
      ? 'Não foi possível adicionar o MCP do Codex.'
      : 'Não foi possível adicionar o MCP do Claude Code.',
    submit: (target) => installAgentIntegration(target.projectId, {
      providerId,
      ...(target.environmentInstanceId
        ? { environmentInstanceId: target.environmentInstanceId }
        : {}),
      kind: 'mcp-server',
      name,
      scope,
      confirmed: true,
      url,
    }),
    apply: () => {
      installName.value = '';
      installUrl.value = '';
      installConfirmed.value = false;
    },
  });
}

watch(selectedProviderId, () => {
  selectedIntegrationView.value = 'all';
  authenticationHandoff.value = null;
});

watch(showIntegrationViewFilters, (showFilters) => {
  if (!showFilters) selectedIntegrationView.value = 'all';
});

watch(
  () => [
    props.project.id,
    props.environmentInstanceId,
    selectedProviderId.value,
  ],
  () => {
    resetDiscovery();
    resetMutations();
    integrationDetails.value = {};
    expandedIntegrationId.value = null;
    inspectingIntegrationId.value = null;
    authenticationHandoff.value = null;
    void load();
  },
  { immediate: true, flush: 'sync' },
);
onBeforeUnmount(() => {
  resetDiscovery();
  resetMutations();
});
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
      v-if="
        selectedProviderId === 'codex' || selectedProviderId === 'claude-code'
      "
      class="agent-integration-install"
      @submit.prevent="installMcp"
    >
      <div class="agent-integrations-list-heading">
        <span>Adicionar MCP remoto</span>
        <small>
          {{
            selectedProviderId === 'codex'
              ? 'Escopo global do usuário'
              : capabilityScopeLabel(claudeMcpInstallScope)
          }}
        </small>
      </div>
      <label>
        <span>Nome</span>
        <input
          v-model="installName"
          type="text"
          maxlength="64"
          placeholder="openaiDeveloperDocs"
          :disabled="mutationBusy"
        />
      </label>
      <label>
        <span>URL HTTPS</span>
        <input
          v-model="installUrl"
          type="url"
          maxlength="2048"
          placeholder="https://example.com/mcp"
          :disabled="mutationBusy"
        />
      </label>
      <label
        v-if="selectedProviderId === 'claude-code'"
        class="agent-integration-install-field"
      >
        <span>Escopo</span>
        <select v-model="claudeMcpInstallScope" :disabled="mutationBusy">
          <option value="local">Local</option>
          <option value="project">Projeto</option>
          <option value="user">Usuário global</option>
        </select>
      </label>
      <label class="agent-integration-confirmation">
        <input
          v-model="installConfirmed"
          type="checkbox"
          :disabled="mutationBusy"
        />
        <span>
          {{
            selectedProviderId === 'codex'
              ? 'Confirmo que este MCP será adicionado à configuração compartilhada do meu usuário Codex.'
              : 'Confirmo a adição deste MCP remoto ao escopo selecionado do Claude Code.'
          }}
        </span>
      </label>
      <div class="agent-integration-install-actions">
        <p>
          O dashboard envia apenas nome, URL HTTPS e escopo ao backend. Headers,
          comandos, argumentos e variáveis de ambiente não são aceitos por este
          formulário.
        </p>
        <button
          class="secondary-button"
          type="submit"
          :disabled="
            mutationBusy ||
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
        <small v-else>
          {{ filteredIntegrations.length }} de
          {{ integrations.length }} item(ns)
        </small>
      </div>

      <div
        v-if="showIntegrationViewFilters"
        class="agent-integrations-view-tabs"
        role="group"
        aria-label="Filtrar integrações"
      >
        <button
          type="button"
          :class="{ active: selectedIntegrationView === 'all' }"
          @click="selectedIntegrationView = 'all'"
        >
          Todos · {{ integrations.length }}
        </button>
        <button
          type="button"
          :class="{ active: selectedIntegrationView === 'installed' }"
          @click="selectedIntegrationView = 'installed'"
        >
          Instalados · {{ installedIntegrationCount }}
        </button>
        <button
          type="button"
          :class="{ active: selectedIntegrationView === 'available' }"
          @click="selectedIntegrationView = 'available'"
        >
          Disponíveis · {{ availableIntegrationCount }}
        </button>
      </div>

      <label
        v-if="showIntegrationViewFilters"
        class="agent-integration-install-scope"
      >
        <span>Escopo para instalar plugins</span>
        <select
          v-model="claudePluginInstallScope"
          :disabled="mutationBusy"
        >
          <option value="local">Local</option>
          <option value="project">Projeto</option>
          <option value="user">Usuário global</option>
        </select>
      </label>

      <div v-if="filteredIntegrations.length" class="agent-integrations-items">
        <article
          v-for="integration in filteredIntegrations"
          :key="integration.id"
          class="agent-integration-item"
        >
          <PuzzlePieceIcon aria-hidden="true" />
          <div>
            <strong>{{ integration.name }}</strong>
            <small v-if="integration.kind === 'marketplace'">
              Marketplace configurado
            </small>
            <small v-else-if="integration.origin === 'claude-plugin-catalog'">
              Plugin disponível para instalar
            </small>
            <small v-else>
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
              <template v-if="integration.kind === 'marketplace'">
                {{ integrationOriginLabel(integration) }}
                · {{ marketplaceSourceLabel(integration) }}
              </template>
              <template v-else>
                {{ integrationScopeLabel(integration) }}
                · {{ integrationOriginLabel(integration) }}
                <template v-if="integration.marketplace">
                  · Marketplace: {{ integration.marketplace }}
                </template>
                <template v-if="integration.version">
                  · v{{ integration.version }}
                </template>
              </template>
            </small>
          </div>
          <div
            v-if="
              (canInspectSelectedProvider &&
                integration.kind === 'mcp-server') ||
              canInstallIntegration(integration) ||
              canAuthenticateIntegration(integration) ||
              canUninstallIntegration(integration)
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
              v-if="canInstallIntegration(integration)"
              class="agent-integration-details-button"
              type="button"
              :disabled="mutationBusy"
              @click="installClaudePlugin(integration)"
            >
              {{
                installingIntegrationId === integration.id
                  ? 'Instalando…'
                  : 'Instalar'
              }}
            </button>
            <button
              v-if="canAuthenticateIntegration(integration)"
              class="agent-integration-details-button"
              type="button"
              :disabled="mutationBusy"
              @click="prepareAuthentication(integration)"
            >
              {{
                authenticatingIntegrationId === integration.id
                  ? 'Preparando…'
                  : 'Autenticar'
              }}
            </button>
            <button
              v-if="canToggleIntegration(integration)"
              class="agent-integration-details-button"
              type="button"
              :disabled="mutationBusy"
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
              v-if="canUninstallIntegration(integration)"
              class="agent-integration-details-button"
              type="button"
              :disabled="mutationBusy"
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
            v-if="authenticationHandoff?.integrationId === integration.id"
            class="agent-integration-auth-handoff"
          >
            <span>
              O OAuth do
              {{ providerLabel(authenticationHandoff.providerId) }} precisa de
              um terminal interativo. O dashboard não executa este comando pelo
              navegador.
            </span>
            <code>{{ authenticationHandoff.command }}</code>
            <div class="agent-integration-auth-actions">
              <button
                class="agent-integration-details-button"
                type="button"
                @click="copyAuthenticationCommand"
              >
                {{
                  authenticationHandoff.copied ? 'Copiado' : 'Copiar comando'
                }}
              </button>
              <RouterLink
                class="agent-integration-details-button"
                :to="{
                  name: 'project-terminal',
                  params: { projectId: project.id },
                  ...(environmentInstanceId
                    ? { query: { environmentInstanceId } }
                    : {}),
                }"
              >
                Abrir terminal
              </RouterLink>
            </div>
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
        {{
          integrations.length
            ? 'Nenhuma integração neste filtro.'
            : 'Nenhuma integração encontrada para este provider.'
        }}
      </p>

      <div v-if="integrationIssues.length" class="agent-integrations-warning">
        <strong>Descoberta parcial</strong>
        <span>
          {{ integrationIssues.length }}
          {{
            integrationIssues.length === 1
              ? 'problema foi isolado'
              : 'problemas foram isolados'
          }}
          durante a descoberta.
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

.agent-integrations-view-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.agent-integrations-view-tabs button {
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  background: transparent;
  font: inherit;
  font-size: 9px;
  cursor: pointer;
}

.agent-integrations-view-tabs button:hover,
.agent-integrations-view-tabs button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.agent-integration-install-scope {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-dim);
  font-size: 9px;
}

.agent-integration-install-scope select {
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-0);
  font: inherit;
  font-size: var(--font-xs);
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

.agent-integration-install-field select {
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

.agent-integration-auth-handoff {
  display: grid;
  grid-column: 1 / -1;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 9px;
}

.agent-integration-auth-handoff code {
  overflow-x: auto;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 10px;
  white-space: nowrap;
}

.agent-integration-auth-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.agent-integration-auth-actions a {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
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
