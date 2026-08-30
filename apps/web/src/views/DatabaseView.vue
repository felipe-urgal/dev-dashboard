<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleStackIcon,
  InformationCircleIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import type {
  DatabaseServiceAction,
  MachineDatabaseConnection,
  MachineDatabaseTable,
  MachineDatabaseService,
  MachineDatabaseServiceDetails,
} from '@dev-dashboard/contracts';

import {
  fetchMachineDatabaseServices,
  fetchMachineDatabaseServiceDetails,
  installMachineDatabaseService,
  runMachineDatabaseServiceAction,
  uninstallMachineDatabaseService,
} from '../api/rails';
import {
  fetchDatabaseExplorerTables,
  previewDatabaseExplorerTable,
  queryDatabaseExplorer,
} from '../api/database-explorer';
import { formatDatabaseExplorerError } from '../api/database-explorer-errors';
import DatabaseExplorerSidebar from '../components/database/DatabaseExplorerSidebar.vue';
import DatabaseQueryEditor from '../components/database/DatabaseQueryEditor.vue';
import DatabaseResultTable from '../components/database/DatabaseResultTable.vue';
import {
  type DatabaseQueryHistoryItem,
  useDatabaseQueryHistory,
} from '../composables/useDatabaseQueryHistory';
import { useDatabaseExplorerSession } from '../composables/useDatabaseExplorerSession';
import { useDatabaseResultView } from '../composables/useDatabaseResultView';
import { useDatabaseTableListView } from '../composables/useDatabaseTableListView';
import { useDatabaseSavedConnections } from '../composables/useDatabaseSavedConnections';
import { confirmDialog } from '../stores/app-dialog';

const services = ref<MachineDatabaseService[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');
const lastUpdatedAt = ref<Date | null>(null);
const expandedServiceId = ref<string | null>(null);
const details = ref<Record<string, MachineDatabaseServiceDetails>>({});
const detailsErrors = ref<Record<string, string>>({});
const detailsLoading = ref<string | null>(null);
const pending = ref<{
  serviceId: string;
  action: DatabaseServiceAction | 'install' | 'uninstall';
} | null>(null);
const installedServices = computed(() =>
  services.value.filter((service) => service.installed),
);
const uninstalledServices = computed(() =>
  services.value.filter((service) => !service.installed),
);
const activeServices = computed(() =>
  installedServices.value.filter((service) => service.active),
);
const explorerModalOpen = ref(false);
const explorerLoading = ref(false);
const explorerError = ref('');
const explorerDraft = ref<MachineDatabaseConnection>({
  driver: 'postgresql',
  host: '127.0.0.1',
  port: 5432,
});
const explorerDatabases = ref<{ name: string }[]>([]);
const explorerTables = ref<MachineDatabaseTable[]>([]);
const {
  search: explorerTableSearch,
  page: explorerTablePage,
  filtered: filteredExplorerTables,
  pageCount: explorerTablePageCount,
  visible: visibleExplorerTables,
  setSearch: setExplorerTableSearch,
  reset: resetExplorerTableList,
  previous: previousExplorerTablePage,
  next: nextExplorerTablePage,
} = useDatabaseTableListView(explorerTables);
const {
  result: explorerResult,
  search: explorerResultSearch,
  sort: explorerResultSort,
  copiedMessage: explorerCopiedMessage,
  durationMs: explorerQueryDurationMs,
  visibleRows: visibleExplorerRows,
  setResult: setExplorerResult,
  setDuration: setExplorerQueryDuration,
  clearCopiedMessage: clearExplorerCopiedMessage,
  resetPresentation: resetExplorerResultPresentation,
  clear: clearExplorerResult,
  toggleSort: toggleExplorerResultSort,
  copy: copyExplorerResults,
  exportResults: exportExplorerResults,
} = useDatabaseResultView();
const explorerQuery = ref('SELECT * FROM ');
const explorerTable = ref('');
const explorerDatabase = ref('');
const {
  connections: savedConnections,
  selectedId: selectedSavedConnectionId,
  load: loadSavedConnections,
  save: saveDatabaseConnection,
  select: selectSavedConnection,
  remove: removeDatabaseSavedConnection,
} = useDatabaseSavedConnections();
const explorerTestMessage = ref('');
const {
  history: explorerQueryHistory,
  recent: recentExplorerQueries,
  load: loadExplorerQueryHistory,
  remember: rememberDatabaseQuery,
  toggleFavorite: toggleExplorerQueryFavorite,
  remove: removeExplorerQueryHistory,
  clear: clearExplorerQueryHistory,
} = useDatabaseQueryHistory();
const explorerHistoryOpen = ref(false);
const {
  sessionId: explorerSessionId,
  connection: explorerConnection,
  connect: connectExplorerSession,
  testConnection: testExplorerSessionConnection,
  disconnect: disconnectExplorerSession,
  handleSessionError: handleExplorerSessionError,
} = useDatabaseExplorerSession({
  onExpired: () => clearExplorerData(true),
});

function rememberExplorerQuery(): void {
  if (!explorerConnection.value) return;
  rememberDatabaseQuery({
    query: explorerQuery.value,
    driver: explorerConnection.value.driver,
    database: explorerDatabase.value,
    table: explorerTable.value,
  });
}

function restoreExplorerQuery(item: DatabaseQueryHistoryItem): void {
  explorerQuery.value = item.query;
  explorerTable.value = item.table;
  if (
    item.database &&
    explorerDatabases.value.some((database) => database.name === item.database)
  ) {
    explorerDatabase.value = item.database;
  }
  explorerHistoryOpen.value = false;
  explorerError.value = '';
}

function saveExplorerConnection(): void {
  saveDatabaseConnection(explorerDraft.value);
  explorerTestMessage.value = 'Conexão salva sem armazenar a senha.';
}

function applySavedConnection(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  const saved = selectSavedConnection(id);
  if (!saved) return;
  explorerDraft.value = {
    driver: saved.driver,
    ...(saved.host ? { host: saved.host } : {}),
    ...(saved.port ? { port: saved.port } : {}),
    ...(saved.username ? { username: saved.username } : {}),
    ...(saved.database ? { database: saved.database } : {}),
  };
  explorerTestMessage.value = 'Informe a senha para testar ou conectar.';
}

function removeSavedConnection(id: string): void {
  removeDatabaseSavedConnection(id);
}

function resetExplorerQuery(): void {
  explorerQuery.value = 'SELECT * FROM ';
}

function connectionDraftWithoutSecret(
  connection: MachineDatabaseConnection,
): MachineDatabaseConnection {
  return {
    driver: connection.driver,
    ...(connection.host ? { host: connection.host } : {}),
    ...(connection.port ? { port: connection.port } : {}),
    ...(connection.username ? { username: connection.username } : {}),
    ...(connection.database ? { database: connection.database } : {}),
  };
}

function buildExplorerTableQuery(table: MachineDatabaseTable): string {
  const qualifiedName = table.schema
    ? `${table.schema}.${table.name}`
    : table.name;
  return `SELECT * FROM ${qualifiedName}`;
}

function clearExplorerData(showExpiryMessage = false): void {
  explorerDatabases.value = [];
  explorerTables.value = [];
  explorerDatabase.value = '';
  explorerTable.value = '';
  resetExplorerTableList();
  clearExplorerResult();
  explorerTestMessage.value = '';
  explorerDraft.value = {
    driver: explorerDraft.value.driver,
    ...(explorerDraft.value.host ? { host: explorerDraft.value.host } : {}),
    ...(explorerDraft.value.port ? { port: explorerDraft.value.port } : {}),
  };
  resetExplorerQuery();
  if (showExpiryMessage) {
    explorerError.value =
      'A conexão expirou. Conecte-se novamente para continuar.';
  }
}

async function disconnectExplorer(): Promise<void> {
  if (explorerLoading.value) return;
  explorerLoading.value = true;
  explorerError.value = '';
  try {
    await disconnectExplorerSession();
    clearExplorerData();
  } catch (error) {
    explorerError.value = formatDatabaseExplorerError(
      error,
      'Não foi possível encerrar a sessão do banco.',
    );
  } finally {
    explorerLoading.value = false;
  }
}

function syncExplorerPort(): void {
  explorerDraft.value = {
    ...explorerDraft.value,
    port: explorerDraft.value.driver === 'postgresql' ? 5432 : 3306,
  };
}

function openExplorerConnection(): void {
  if (explorerConnection.value) {
    explorerDraft.value = connectionDraftWithoutSecret(
      explorerConnection.value,
    );
  }
  explorerModalOpen.value = true;
  explorerError.value = '';
  explorerTestMessage.value = '';
}

function closeExplorerConnection(): void {
  if (!explorerLoading.value) explorerModalOpen.value = false;
}

async function connectExplorer(): Promise<void> {
  explorerLoading.value = true;
  explorerError.value = '';
  explorerTestMessage.value = '';
  setExplorerResult(null);
  try {
    const connection = { ...explorerDraft.value };
    explorerDatabases.value = await connectExplorerSession(connection);
    explorerDatabase.value = '';
    explorerTable.value = '';
    explorerTables.value = [];
    resetExplorerTableList();
    clearExplorerResult();
    explorerDraft.value = connectionDraftWithoutSecret(connection);
    resetExplorerQuery();
    explorerModalOpen.value = false;
  } catch (error) {
    if (!handleExplorerSessionError(error)) {
      explorerError.value = formatDatabaseExplorerError(
        error,
        'Não foi possível conectar ao banco.',
      );
    }
  } finally {
    explorerLoading.value = false;
  }
}

async function selectExplorerDatabase(database: string): Promise<void> {
  const sessionId = explorerSessionId.value;
  if (!sessionId) return;
  explorerDatabase.value = database;
  explorerTable.value = '';
  resetExplorerTableList();
  setExplorerResult(null);
  setExplorerQueryDuration(null);
  resetExplorerQuery();
  explorerLoading.value = true;
  explorerError.value = '';
  try {
    const tables = await fetchDatabaseExplorerTables(
      sessionId,
      database || undefined,
    );
    if (explorerSessionId.value === sessionId) explorerTables.value = tables;
  } catch (error) {
    if (!handleExplorerSessionError(error)) {
      explorerError.value = formatDatabaseExplorerError(
        error,
        'Não foi possível listar as tabelas.',
      );
    }
  } finally {
    explorerLoading.value = false;
  }
}

function selectExplorerTable(table: MachineDatabaseTable): void {
  explorerTable.value = table.name;
  explorerQuery.value = buildExplorerTableQuery(table);
  void previewExplorerTable();
}

async function previewExplorerTable(): Promise<void> {
  const sessionId = explorerSessionId.value;
  if (!sessionId) return;
  const table = explorerTables.value.find(
    (item) => item.name === explorerTable.value,
  );
  if (!table) return;
  explorerQuery.value = buildExplorerTableQuery(table);
  explorerLoading.value = true;
  explorerError.value = '';
  resetExplorerResultPresentation();
  const startedAt = performance.now();
  try {
    const result = await previewDatabaseExplorerTable(
      sessionId,
      table,
      explorerDatabase.value || undefined,
    );
    if (explorerSessionId.value === sessionId) setExplorerResult(result);
  } catch (error) {
    if (!handleExplorerSessionError(error)) {
      explorerError.value = formatDatabaseExplorerError(
        error,
        'Não foi possível consultar a tabela.',
      );
    }
  } finally {
    if (explorerSessionId.value === sessionId) {
      setExplorerQueryDuration(Math.round(performance.now() - startedAt));
    }
    explorerLoading.value = false;
  }
}

async function runExplorerQuery(): Promise<void> {
  const sessionId = explorerSessionId.value;
  if (!sessionId) return;
  if (!explorerQuery.value.trim()) {
    explorerError.value = 'Informe uma consulta SELECT ou WITH.';
    return;
  }
  explorerLoading.value = true;
  explorerError.value = '';
  clearExplorerCopiedMessage();
  const startedAt = performance.now();
  try {
    const result = await queryDatabaseExplorer(
      sessionId,
      explorerQuery.value,
      explorerDatabase.value || undefined,
    );
    if (explorerSessionId.value === sessionId) {
      setExplorerResult(result);
      rememberExplorerQuery();
    }
  } catch (error) {
    if (!handleExplorerSessionError(error)) {
      explorerError.value = formatDatabaseExplorerError(
        error,
        'Não foi possível executar a consulta.',
      );
    }
  } finally {
    if (explorerSessionId.value === sessionId) {
      setExplorerQueryDuration(Math.round(performance.now() - startedAt));
    }
    explorerLoading.value = false;
  }
}

async function testExplorerConnection(): Promise<void> {
  explorerLoading.value = true;
  explorerError.value = '';
  explorerTestMessage.value = '';
  try {
    const databases = await testExplorerSessionConnection({
      ...explorerDraft.value,
    });
    explorerTestMessage.value = `Conexão validada. ${databases.length} banco(s) encontrado(s).`;
  } catch (error) {
    explorerError.value = formatDatabaseExplorerError(
      error,
      'Não foi possível testar a conexão.',
    );
  } finally {
    explorerLoading.value = false;
  }
}

async function loadServices(
  options: { clearSuccess?: boolean } = {},
): Promise<boolean> {
  loading.value = true;
  errorMessage.value = '';
  if (options.clearSuccess) successMessage.value = '';
  try {
    services.value = await fetchMachineDatabaseServices();
    lastUpdatedAt.value = new Date();
    return true;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar os serviços do sistema.';
    return false;
  } finally {
    loading.value = false;
  }
}

function refreshServices(): void {
  void loadServices({ clearSuccess: true });
}

function serviceDetails(
  serviceId: string,
): MachineDatabaseServiceDetails | undefined {
  return details.value[serviceId];
}

function reachabilityLabel(
  value: MachineDatabaseServiceDetails['reachability'],
) {
  return {
    reachable: 'Porta acessível',
    unreachable: 'Porta indisponível',
    unknown: 'Não testada',
  }[value];
}

async function loadDetails(serviceId: string): Promise<void> {
  detailsLoading.value = serviceId;
  detailsErrors.value = { ...detailsErrors.value, [serviceId]: '' };
  try {
    details.value = {
      ...details.value,
      [serviceId]: await fetchMachineDatabaseServiceDetails(serviceId),
    };
  } catch (error) {
    detailsErrors.value = {
      ...detailsErrors.value,
      [serviceId]:
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar os detalhes do serviço.',
    };
  } finally {
    detailsLoading.value = null;
  }
}

async function toggleDetails(serviceId: string): Promise<void> {
  if (expandedServiceId.value === serviceId) {
    expandedServiceId.value = null;
    return;
  }
  expandedServiceId.value = serviceId;
  if (!serviceDetails(serviceId)) await loadDetails(serviceId);
}

function actionLabel(action: DatabaseServiceAction | 'install' | 'uninstall') {
  return {
    start: 'iniciado',
    stop: 'parado',
    restart: 'reiniciado',
    install: 'instalado',
    uninstall: 'desinstalado',
  }[action];
}

async function runAction(
  service: MachineDatabaseService,
  action: DatabaseServiceAction,
): Promise<void> {
  if (!service.installed || pending.value) return;
  if (action === 'stop' || action === 'restart') {
    const actionLabel = action === 'stop' ? 'parar' : 'reiniciar';
    const confirmed = await confirmDialog({
      title: `${action === 'stop' ? 'Parar' : 'Reiniciar'} ${service.label}?`,
      message: `O serviço ${service.label} será ${actionLabel}. Aplicações que dependem dele podem ficar indisponíveis durante a operação.`,
      confirmLabel: action === 'stop' ? 'Parar serviço' : 'Reiniciar serviço',
      tone: 'warning',
    });
    if (!confirmed) return;
  }
  pending.value = { serviceId: service.id, action };
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await runMachineDatabaseServiceAction(service.id, action);
    const refreshed = await loadServices();
    if (refreshed) {
      successMessage.value = `${service.label} ${actionLabel(action)} com sucesso.`;
      details.value = {};
    } else if (!errorMessage.value) {
      errorMessage.value = `${service.label} foi ${actionLabel(action)}, mas não foi possível atualizar o status.`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível alterar o serviço do sistema.';
  } finally {
    pending.value = null;
  }
}

function isPending(
  service: MachineDatabaseService,
  action: DatabaseServiceAction | 'install' | 'uninstall',
) {
  return (
    pending.value?.serviceId === service.id && pending.value?.action === action
  );
}

async function installService(service: MachineDatabaseService): Promise<void> {
  if (service.installed || pending.value) return;
  const confirmed = await confirmDialog({
    title: `Instalar ${service.label}?`,
    message: `A instalação de ${service.label} altera os pacotes do sistema e pode solicitar sua senha.`,
    confirmLabel: 'Instalar serviço',
    tone: 'warning',
  });
  if (!confirmed) return;
  pending.value = { serviceId: service.id, action: 'install' };
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await installMachineDatabaseService(service.id);
    const refreshed = await loadServices();
    if (refreshed) {
      successMessage.value = `${service.label} instalado com sucesso.`;
      details.value = {};
    } else if (!errorMessage.value) {
      errorMessage.value = `${service.label} foi instalado, mas não foi possível atualizar o status.`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível instalar o serviço do sistema.';
  } finally {
    pending.value = null;
  }
}

async function uninstallService(
  service: MachineDatabaseService,
): Promise<void> {
  if (!service.installed || pending.value) return;
  const confirmed = await confirmDialog({
    title: `Desinstalar ${service.label}?`,
    message: `O pacote de ${service.label} será removido do sistema. Os dados do banco podem permanecer no disco e o serviço ficará indisponível.`,
    confirmLabel: 'Desinstalar serviço',
    tone: 'danger',
  });
  if (!confirmed) return;
  pending.value = { serviceId: service.id, action: 'uninstall' };
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await uninstallMachineDatabaseService(service.id);
    const refreshed = await loadServices();
    if (refreshed) {
      successMessage.value = `${service.label} desinstalado com sucesso.`;
      details.value = {};
    } else if (!errorMessage.value) {
      errorMessage.value = `${service.label} foi desinstalado, mas não foi possível atualizar o status.`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível desinstalar o serviço do sistema.';
  } finally {
    pending.value = null;
  }
}

onMounted(() => {
  loadSavedConnections();
  loadExplorerQueryHistory();
  void loadServices();
});
</script>

<template>
  <section
    class="content database-machine-page"
    aria-labelledby="database-page-title"
    :aria-busy="loading"
  >
    <header class="database-machine-header">
      <div>
        <span class="database-machine-eyebrow">Serviços da máquina</span>
        <h1 id="database-page-title">Banco de dados</h1>
        <p>
          Gerencie os bancos instalados no sistema, independentemente do
          workspace.
        </p>
      </div>
      <button
        type="button"
        class="database-machine-refresh"
        :disabled="loading"
        @click="refreshServices"
      >
        <ArrowPathIcon :class="{ 'is-spinning': loading }" aria-hidden="true" />
        {{ loading ? 'Atualizando…' : 'Atualizar' }}
      </button>
    </header>

    <p v-if="successMessage" class="database-machine-success" role="status">
      {{ successMessage }}
      <span v-if="lastUpdatedAt">
        Status atualizado às
        {{
          lastUpdatedAt.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })
        }}.
      </span>
    </p>
    <p v-if="errorMessage" class="activity-error" role="alert">
      {{ errorMessage }}
    </p>
    <div
      v-if="loading && services.length === 0"
      class="activity-empty"
      role="status"
    >
      Consultando os serviços do sistema…
    </div>
    <template v-else>
      <div class="database-machine-overview" aria-label="Resumo dos serviços">
        <div class="database-machine-overview-item">
          <span>Instalados</span>
          <strong>{{ installedServices.length }}</strong>
        </div>
        <div class="database-machine-overview-item">
          <span>Em execução</span>
          <strong class="is-success">{{ activeServices.length }}</strong>
        </div>
        <div class="database-machine-overview-item">
          <span>Disponíveis</span>
          <strong>{{ uninstalledServices.length }}</strong>
        </div>
      </div>

      <div v-if="installedServices.length" class="database-machine-section">
        <div class="database-machine-section-heading">
          <div>
            <h2>Serviços da máquina</h2>
            <p>Gerencie os serviços disponíveis nesta máquina.</p>
          </div>
          <span class="database-machine-count"
            >{{ installedServices.length }} serviços</span
          >
        </div>
      </div>
      <div v-if="installedServices.length" class="database-machine-list">
        <article
          v-for="service in installedServices"
          :key="service.id"
          class="database-machine-card"
          :data-service-id="service.id"
          :aria-busy="pending?.serviceId === service.id"
        >
          <div class="database-machine-card-icon">
            <CircleStackIcon aria-hidden="true" />
          </div>
          <div class="database-machine-card-copy">
            <div class="database-machine-title-line">
              <h2>{{ service.label }}</h2>
              <span
                :class="['database-machine-status', { active: service.active }]"
              >
                {{ service.active ? 'Em execução' : 'Parado' }}
              </span>
            </div>
            <div class="database-machine-meta">
              <code>{{ service.unit }}</code>
              <span>systemd</span>
            </div>
          </div>
          <div v-if="service.installed" class="database-machine-actions">
            <button
              v-if="!service.active"
              type="button"
              :disabled="pending !== null"
              @click="runAction(service, 'start')"
            >
              <PlayIcon aria-hidden="true" />
              {{ isPending(service, 'start') ? 'Iniciando…' : 'Iniciar' }}
            </button>
            <template v-else>
              <button
                type="button"
                :disabled="pending !== null"
                @click="runAction(service, 'restart')"
              >
                <ArrowPathIcon aria-hidden="true" />
                {{
                  isPending(service, 'restart') ? 'Reiniciando…' : 'Reiniciar'
                }}
              </button>
              <button
                type="button"
                class="danger"
                :disabled="pending !== null"
                @click="runAction(service, 'stop')"
              >
                <PauseIcon aria-hidden="true" />
                {{ isPending(service, 'stop') ? 'Parando…' : 'Parar' }}
              </button>
            </template>
            <button
              type="button"
              class="database-machine-details-toggle"
              :disabled="
                detailsLoading !== null && detailsLoading !== service.id
              "
              :aria-expanded="expandedServiceId === service.id"
              :aria-controls="`database-details-${service.id}`"
              @click="toggleDetails(service.id)"
            >
              <InformationCircleIcon aria-hidden="true" />
              {{
                expandedServiceId === service.id
                  ? 'Ocultar detalhes'
                  : 'Ver detalhes'
              }}
              <ChevronUpIcon
                v-if="expandedServiceId === service.id"
                aria-hidden="true"
              />
              <ChevronDownIcon v-else aria-hidden="true" />
            </button>
            <button
              type="button"
              class="danger"
              :disabled="pending !== null"
              @click="uninstallService(service)"
            >
              <TrashIcon aria-hidden="true" />
              {{
                isPending(service, 'uninstall')
                  ? 'Desinstalando…'
                  : 'Desinstalar'
              }}
            </button>
          </div>
          <div
            v-if="expandedServiceId === service.id"
            :id="`database-details-${service.id}`"
            class="database-machine-details"
          >
            <div v-if="detailsLoading === service.id" role="status">
              Consultando detalhes…
            </div>
            <template v-else-if="serviceDetails(service.id)">
              <div class="database-machine-details-grid">
                <div>
                  <span>Porta</span>
                  <strong>{{ serviceDetails(service.id)?.port ?? '—' }}</strong>
                </div>
                <div>
                  <span>PID</span>
                  <strong>{{ serviceDetails(service.id)?.pid ?? '—' }}</strong>
                </div>
                <div>
                  <span>Versão</span>
                  <strong>{{
                    serviceDetails(service.id)?.version ?? '—'
                  }}</strong>
                </div>
                <div>
                  <span>Conexão</span>
                  <strong
                    :class="`database-machine-reachability-${serviceDetails(service.id)?.reachability}`"
                  >
                    {{
                      reachabilityLabel(
                        serviceDetails(service.id)?.reachability ?? 'unknown',
                      )
                    }}
                  </strong>
                </div>
              </div>
              <div class="database-machine-details-toolbar">
                <span v-if="serviceDetails(service.id)?.startedAt">
                  Iniciado em {{ serviceDetails(service.id)?.startedAt }}
                </span>
                <button
                  type="button"
                  :disabled="detailsLoading !== null"
                  @click="loadDetails(service.id)"
                >
                  <ArrowPathIcon aria-hidden="true" />
                  {{
                    detailsLoading === service.id
                      ? 'Testando…'
                      : 'Testar conexão'
                  }}
                </button>
              </div>
              <p
                v-if="detailsErrors[service.id]"
                class="database-machine-details-error"
                role="alert"
              >
                {{ detailsErrors[service.id] }}
              </p>
              <div class="database-machine-log">
                <div class="database-machine-log-heading">
                  <span>Logs recentes</span>
                  <small>últimas 40 linhas</small>
                </div>
                <pre v-if="serviceDetails(service.id)?.logs.length">{{
                  serviceDetails(service.id)?.logs.join('\n')
                }}</pre>
                <p v-else>Não há logs recentes disponíveis.</p>
              </div>
            </template>
          </div>
        </article>
      </div>

      <div
        v-if="uninstalledServices.length"
        class="database-machine-section database-machine-section-available"
      >
        <div class="database-machine-section-heading">
          <div>
            <h2>Disponíveis para instalar</h2>
            <p>Instale um serviço quando precisar dele nesta máquina.</p>
          </div>
          <span class="database-machine-count"
            >{{ uninstalledServices.length }} disponíveis</span
          >
        </div>
      </div>
      <div v-if="uninstalledServices.length" class="database-machine-list">
        <article
          v-for="service in uninstalledServices"
          :key="service.id"
          class="database-machine-card database-machine-card-uninstalled"
          :data-service-id="service.id"
          :aria-busy="pending?.serviceId === service.id"
        >
          <div class="database-machine-card-icon">
            <CircleStackIcon aria-hidden="true" />
          </div>
          <div class="database-machine-card-copy">
            <h2>{{ service.label }}</h2>
            <div class="database-machine-meta">
              <code>{{ service.unit }}</code>
              <span>Não instalado</span>
            </div>
          </div>
          <div class="database-machine-actions">
            <button
              type="button"
              :disabled="pending !== null"
              @click="installService(service)"
            >
              <PlayIcon aria-hidden="true" />
              {{ isPending(service, 'install') ? 'Instalando…' : 'Instalar' }}
            </button>
          </div>
        </article>
      </div>
      <section
        class="database-explorer"
        aria-labelledby="database-explorer-title"
      >
        <div class="database-machine-section-heading">
          <div>
            <h2 id="database-explorer-title">Explorador de dados</h2>
            <p>
              Acesso local somente leitura. Credenciais ficam apenas nesta
              sessão.
            </p>
          </div>
        </div>
        <div class="database-connection-bar">
          <LinkIcon aria-hidden="true" />
          <div>
            <strong>Conexão</strong>
            <span>{{
              explorerConnection
                ? `${explorerConnection.driver} · ${explorerConnection.host}:${explorerConnection.port}`
                : 'Nenhuma conexão ativa'
            }}</span>
          </div>
          <button
            type="button"
            class="database-primary-button database-connection-button"
            :disabled="explorerLoading"
            @click="openExplorerConnection"
          >
            {{ explorerConnection ? 'Trocar conexão' : 'Conectar' }}
            <ChevronDownIcon aria-hidden="true" />
          </button>
          <button
            v-if="explorerConnection"
            type="button"
            class="database-connection-disconnect"
            :disabled="explorerLoading"
            @click="disconnectExplorer"
          >
            Desconectar
          </button>
        </div>
        <p
          v-if="explorerError"
          class="database-machine-details-error"
          role="alert"
        >
          {{ explorerError }}
        </p>
        <div v-if="!explorerConnection" class="database-explorer-empty">
          <div class="database-explorer-empty-copy">
            <h3>Bancos e tabelas</h3>
            <p>Conecte-se para visualizar seus bancos e tabelas.</p>
          </div>
          <div class="database-explorer-empty-art" aria-hidden="true">
            <CircleStackIcon />
            <MagnifyingGlassIcon />
          </div>
          <div
            class="database-explorer-empty-copy database-explorer-empty-copy-right"
          >
            <h3>Conecte-se para explorar seus bancos</h3>
            <p>Use uma conexão local somente leitura para começar.</p>
            <button
              type="button"
              class="database-primary-button"
              @click="openExplorerConnection"
            >
              Conectar a um serviço
            </button>
          </div>
        </div>
        <div v-else class="database-explorer-workspace">
          <DatabaseExplorerSidebar
            :databases="explorerDatabases"
            :tables="visibleExplorerTables"
            :selected-database="explorerDatabase"
            :selected-table="explorerTable"
            :table-search="explorerTableSearch"
            :filtered-table-count="filteredExplorerTables.length"
            :page="explorerTablePage"
            :page-count="explorerTablePageCount"
            :loading="explorerLoading"
            @select-database="selectExplorerDatabase"
            @search-table="setExplorerTableSearch"
            @select-table="selectExplorerTable"
            @previous-page="previousExplorerTablePage"
            @next-page="nextExplorerTablePage"
          />
          <div class="database-explorer-main">
            <div v-if="!explorerTable" class="database-explorer-main-empty">
              <CircleStackIcon aria-hidden="true" />
              <h3>Selecione uma tabela</h3>
              <p>Escolha um banco e uma tabela para visualizar os dados.</p>
            </div>
            <template v-else>
              <DatabaseResultTable
                :table="explorerTable"
                :result="explorerResult"
                :visible-rows="visibleExplorerRows"
                :duration-ms="explorerQueryDurationMs"
                :search="explorerResultSearch"
                :sort="explorerResultSort"
                :copied-message="explorerCopiedMessage"
                @update:search="explorerResultSearch = $event"
                @toggle-sort="toggleExplorerResultSort"
                @copy="copyExplorerResults"
                @export="exportExplorerResults"
              />
              <DatabaseQueryEditor
                :query="explorerQuery"
                :loading="explorerLoading"
                :history-open="explorerHistoryOpen"
                :history-count="explorerQueryHistory.length"
                :recent-queries="recentExplorerQueries"
                @update:query="explorerQuery = $event"
                @toggle-history="explorerHistoryOpen = !explorerHistoryOpen"
                @clear-history="clearExplorerQueryHistory"
                @restore-query="restoreExplorerQuery"
                @toggle-favorite="toggleExplorerQueryFavorite"
                @remove-history="removeExplorerQueryHistory"
                @reset="resetExplorerQuery"
                @run="runExplorerQuery"
              />
            </template>
          </div>
        </div>
      </section>
    </template>
  </section>
  <div
    v-if="explorerModalOpen"
    class="database-modal-backdrop"
    @click.self="closeExplorerConnection"
  >
    <section
      class="database-connection-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="database-connection-title"
    >
      <div class="database-modal-heading">
        <div>
          <span class="database-machine-eyebrow">Conexão local</span>
          <h2 id="database-connection-title">Conectar a um serviço</h2>
          <p>As credenciais são usadas somente nesta sessão.</p>
        </div>
        <button
          type="button"
          aria-label="Fechar"
          @click="closeExplorerConnection"
        >
          ×
        </button>
      </div>
      <div class="database-connection-form">
        <div v-if="savedConnections.length" class="database-saved-connections">
          <label for="database-saved-connection">Conexão salva</label>
          <div class="database-saved-connection-control">
            <select
              id="database-saved-connection"
              v-model="selectedSavedConnectionId"
              @change="applySavedConnection"
            >
              <option value="">Selecione uma conexão</option>
              <option
                v-for="saved in savedConnections"
                :key="saved.id"
                :value="saved.id"
              >
                {{ saved.label }}
              </option>
            </select>
            <button
              v-if="selectedSavedConnectionId"
              type="button"
              class="database-saved-remove"
              @click="removeSavedConnection(selectedSavedConnectionId)"
            >
              Remover
            </button>
          </div>
        </div>
        <label
          >Banco<select
            v-model="explorerDraft.driver"
            @change="syncExplorerPort"
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="mariadb">MariaDB</option>
          </select></label
        >
        <label
          >Host<input v-model="explorerDraft.host" autocomplete="off"
        /></label>
        <label
          >Porta<input
            v-model.number="explorerDraft.port"
            type="number"
            min="1"
            max="65535"
        /></label>
        <label
          >Usuário<input
            v-model="explorerDraft.username"
            placeholder="ex.: felipe, root ou postgres"
            autocomplete="off"
        /></label>
        <label
          >Senha<input
            v-model="explorerDraft.password"
            type="password"
            autocomplete="new-password"
        /></label>
        <label
          >Banco (opcional)<input
            v-model="explorerDraft.database"
            placeholder="Vazio lista todos"
            autocomplete="off"
        /></label>
      </div>
      <p
        v-if="explorerError"
        class="database-machine-details-error"
        role="alert"
      >
        {{ explorerError }}
      </p>
      <p
        v-if="explorerTestMessage"
        class="database-machine-success"
        role="status"
      >
        {{ explorerTestMessage }}
      </p>
      <div class="database-modal-actions">
        <button type="button" @click="closeExplorerConnection">Cancelar</button>
        <button
          type="button"
          :disabled="explorerLoading"
          @click="saveExplorerConnection"
        >
          Salvar sem senha
        </button>
        <button
          type="button"
          :disabled="explorerLoading"
          @click="testExplorerConnection"
        >
          {{ explorerLoading ? 'Testando…' : 'Testar conexão' }}</button
        ><button
          type="button"
          class="database-primary-button"
          :disabled="explorerLoading"
          @click="connectExplorer"
        >
          {{ explorerLoading ? 'Conectando…' : 'Conectar e continuar' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style src="./DatabaseView.css"></style>
