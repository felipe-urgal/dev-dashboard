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

function onExplorerDatabaseChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  void selectExplorerDatabase(target.value);
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

function onExplorerTableSearch(event: Event): void {
  setExplorerTableSearch((event.target as HTMLInputElement).value);
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
          <aside
            class="database-explorer-sidebar"
            aria-label="Bancos e tabelas"
          >
            <div class="database-explorer-sidebar-heading">
              <div>
                <strong>Bancos e tabelas</strong
                ><span>{{ explorerDatabases.length }} bancos</span>
              </div>
              <ArrowPathIcon
                v-if="explorerLoading"
                class="is-spinning"
                aria-label="Carregando"
              />
            </div>
            <label
              v-if="explorerTables.length"
              class="database-explorer-table-search"
            >
              <span>Buscar tabela</span>
              <input
                :value="explorerTableSearch"
                type="search"
                placeholder="Nome da tabela"
                @input="onExplorerTableSearch"
              />
            </label>
            <label class="database-explorer-select-label"
              >Banco
              <select
                :value="explorerDatabase"
                :disabled="explorerLoading"
                @change="onExplorerDatabaseChange"
              >
                <option value="">Selecione um banco</option>
                <option
                  v-for="database in explorerDatabases"
                  :key="database.name"
                  :value="database.name"
                >
                  {{ database.name }}
                </option>
              </select>
            </label>
            <div v-if="explorerDatabase" class="database-explorer-table-list">
              <span>Tabelas</span>
              <button
                v-for="table in visibleExplorerTables"
                :key="`${table.schema}.${table.name}`"
                type="button"
                :class="{ active: explorerTable === table.name }"
                :disabled="explorerLoading"
                @click="
                  explorerTable = table.name;
                  explorerQuery = buildExplorerTableQuery(table);
                  void previewExplorerTable();
                "
              >
                {{ table.schema ? `${table.schema}.` : '' }}{{ table.name }}
              </button>
              <p v-if="!filteredExplorerTables.length && !explorerLoading">
                Nenhuma tabela encontrada para esta busca.
              </p>
              <div
                v-if="explorerTablePageCount > 1"
                class="database-explorer-pagination"
              >
                <button
                  type="button"
                  :disabled="explorerTablePage === 1"
                  @click="previousExplorerTablePage"
                >
                  Anterior
                </button>
                <span
                  >Página {{ explorerTablePage }} de
                  {{ explorerTablePageCount }}</span
                >
                <button
                  type="button"
                  :disabled="explorerTablePage === explorerTablePageCount"
                  @click="nextExplorerTablePage"
                >
                  Próxima
                </button>
              </div>
            </div>
          </aside>
          <div class="database-explorer-main">
            <div v-if="!explorerTable" class="database-explorer-main-empty">
              <CircleStackIcon aria-hidden="true" />
              <h3>Selecione uma tabela</h3>
              <p>Escolha um banco e uma tabela para visualizar os dados.</p>
            </div>
            <template v-else>
              <div class="database-explorer-result-heading">
                <div>
                  <span>Visualização</span>
                  <h3>{{ explorerTable }}</h3>
                </div>
                <span v-if="explorerResult">
                  {{ visibleExplorerRows.length }} de
                  {{ explorerResult.rowCount }} linhas
                  <template v-if="explorerQueryDurationMs !== null">
                    · {{ explorerQueryDurationMs }} ms
                  </template>
                  <template v-if="explorerResult.truncated">
                    · resultado limitado
                  </template>
                </span>
              </div>
              <div v-if="explorerResult" class="database-explorer-result-tools">
                <label>
                  <MagnifyingGlassIcon aria-hidden="true" />
                  <span class="sr-only">Buscar nos resultados</span>
                  <input
                    v-model="explorerResultSearch"
                    type="search"
                    placeholder="Buscar nos resultados"
                  />
                </label>
                <div>
                  <button type="button" @click="copyExplorerResults">
                    Copiar
                  </button>
                  <button type="button" @click="exportExplorerResults('csv')">
                    CSV
                  </button>
                  <button type="button" @click="exportExplorerResults('json')">
                    JSON
                  </button>
                  <span v-if="explorerCopiedMessage" role="status">
                    {{ explorerCopiedMessage }}
                  </span>
                </div>
              </div>
              <div v-if="explorerResult" class="database-explorer-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th
                        v-for="column in explorerResult.columns"
                        :key="column"
                      >
                        <button
                          type="button"
                          @click="toggleExplorerResultSort(column)"
                        >
                          {{ column }}
                          <ChevronUpIcon
                            v-if="
                              explorerResultSort?.column === column &&
                              explorerResultSort.direction === 'asc'
                            "
                            aria-hidden="true"
                          />
                          <ChevronDownIcon
                            v-else-if="explorerResultSort?.column === column"
                            aria-hidden="true"
                          />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, rowIndex) in visibleExplorerRows"
                      :key="rowIndex"
                    >
                      <td
                        v-for="(value, columnIndex) in row"
                        :key="columnIndex"
                      >
                        {{ value ?? 'NULL' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="database-explorer-query-box">
                <div class="database-explorer-query-heading">
                  <div>
                    <label for="database-query">Consulta SELECT/WITH</label>
                    <span>Ctrl/Cmd + Enter para executar</span>
                  </div>
                  <button
                    type="button"
                    @click="explorerHistoryOpen = !explorerHistoryOpen"
                  >
                    Histórico
                  </button>
                </div>
                <div
                  v-if="explorerHistoryOpen"
                  class="database-explorer-history"
                >
                  <div class="database-explorer-history-heading">
                    <span>Consultas recentes</span>
                    <button
                      type="button"
                      :disabled="!explorerQueryHistory.length"
                      @click="clearExplorerQueryHistory"
                    >
                      Limpar histórico
                    </button>
                  </div>
                  <p v-if="!recentExplorerQueries.length">
                    Nenhuma consulta executada nesta sessão do navegador.
                  </p>
                  <div
                    v-for="item in recentExplorerQueries"
                    :key="item.id"
                    class="database-explorer-history-item"
                  >
                    <button
                      type="button"
                      class="database-explorer-history-query"
                      @click="restoreExplorerQuery(item)"
                    >
                      <strong>{{ item.favorite ? '★' : '☆' }}</strong>
                      <code>{{ item.query }}</code>
                    </button>
                    <button
                      type="button"
                      :aria-label="
                        item.favorite
                          ? 'Remover favorito'
                          : 'Favoritar consulta'
                      "
                      @click="toggleExplorerQueryFavorite(item.id)"
                    >
                      {{ item.favorite ? '★' : '☆' }}
                    </button>
                    <button
                      type="button"
                      aria-label="Remover consulta do histórico"
                      @click="removeExplorerQueryHistory(item.id)"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <textarea
                  id="database-query"
                  v-model="explorerQuery"
                  maxlength="4000"
                  rows="3"
                  spellcheck="false"
                  @keydown.ctrl.enter.prevent="runExplorerQuery"
                  @keydown.meta.enter.prevent="runExplorerQuery"
                />
                <div class="database-explorer-query-actions">
                  <button
                    type="button"
                    :disabled="explorerLoading"
                    @click="resetExplorerQuery"
                  >
                    Limpar consulta
                  </button>
                  <button
                    type="button"
                    class="database-primary-button"
                    :disabled="explorerLoading"
                    @click="runExplorerQuery"
                  >
                    {{ explorerLoading ? 'Consultando…' : 'Executar leitura' }}
                  </button>
                </div>
              </div>
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

<style scoped>
.database-machine-page {
  padding: 28px;
  --card-bg: var(--surface-1);
  --border-color: var(--border);
  --muted-text: var(--text-muted);
}
.database-explorer {
  max-width: 1120px;
  margin-top: 36px;
}
.database-explorer-panel {
  display: grid;
  gap: 14px;
  margin-top: 14px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
}
.database-explorer-form,
.database-explorer-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.database-explorer-form label,
.database-explorer-query {
  display: grid;
  gap: 5px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-explorer input,
.database-explorer select,
.database-explorer textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
}
.database-explorer-toolbar {
  display: flex;
  justify-content: flex-end;
}
.database-explorer-grid > div {
  display: grid;
  align-content: start;
  gap: 8px;
}
.database-explorer-grid ul {
  max-height: 100px;
  margin: 0;
  overflow: auto;
  padding-left: 18px;
  color: var(--muted-text);
  font-size: 12px;
}
.database-explorer-result {
  display: grid;
  gap: 8px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-explorer-table-wrap {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--border-color);
}
.database-explorer table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.database-explorer th,
.database-explorer td {
  padding: 7px 9px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  white-space: nowrap;
}
@media (max-width: 680px) {
  .database-explorer-form,
  .database-explorer-grid {
    grid-template-columns: 1fr;
  }
}

/* Database explorer v2: compact service rows and guided data exploration. */
.database-machine-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 28px 56px;
}
.database-machine-header {
  padding-bottom: 26px;
  border-bottom: 1px solid var(--border-color);
}
.database-machine-header h1 {
  font-size: clamp(26px, 3vw, 34px);
}
.database-machine-overview {
  max-width: none;
  margin: 26px 0 34px;
  border-radius: 10px;
}
.database-machine-section-heading {
  max-width: none;
  margin-top: 26px;
}
.database-machine-section-heading h2 {
  font-size: 17px;
}
.database-machine-section-heading p {
  font-size: 12px;
}
.database-machine-list {
  max-width: none;
  gap: 0;
  border-top: 1px solid var(--border-color);
}
.database-machine-card {
  display: grid;
  grid-template-columns: 44px minmax(220px, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-height: 86px;
  padding: 16px 0;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  background: transparent;
}
.database-machine-card-icon {
  width: 42px;
  height: 42px;
  background: var(--accent-soft);
}
.database-machine-card-copy h2 {
  margin: 0;
  font-size: 15px;
}
.database-machine-title-line {
  gap: 10px;
}
.database-machine-status {
  font-size: 11px;
}
.database-machine-meta {
  margin-top: 5px;
}
.database-machine-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}
.database-machine-details {
  grid-column: 2 / -1;
  width: auto;
  margin: 0 0 4px;
}
.database-machine-section-available {
  margin-top: 34px;
}
.database-explorer {
  max-width: none;
  margin-top: 34px;
  padding-top: 0;
  border-top: 0;
}
.database-machine-page {
  max-width: none;
  margin: 0;
  padding: 32px 28px 56px;
}
.database-machine-header {
  margin-bottom: 34px;
  padding-bottom: 0;
  border-bottom: 0;
}
.database-machine-overview {
  display: none;
}
.database-machine-section-heading {
  margin: 0 0 16px;
}
.database-machine-section-heading h2 {
  margin-bottom: 5px;
}
.database-machine-section-heading .database-machine-count {
  align-self: center;
}
.database-machine-section-available {
  margin-top: 34px;
}
.database-machine-card {
  min-height: 76px;
}
.database-machine-actions button {
  border-radius: 4px;
}
.database-connection-button {
  color: var(--text);
  border-color: var(--border-color);
  background: var(--card-bg);
}
.database-explorer-empty {
  min-height: 382px;
  border-radius: 0;
  background: var(--card-bg);
}
.database-explorer-empty-copy {
  display: grid;
  justify-items: center;
  align-content: center;
  min-height: 100%;
  padding: 28px;
  text-align: center;
}
.database-explorer-empty-copy-right {
  border-left: 1px solid var(--border-color);
}
.database-explorer-empty-art {
  position: relative;
  width: 86px;
  height: 86px;
}
.database-explorer-empty-art svg {
  position: absolute;
  width: 42px;
  height: 42px;
}
.database-explorer-empty-art svg:last-child {
  right: 4px;
  bottom: 4px;
  width: 28px;
  height: 28px;
  padding: 4px;
  border-radius: 50%;
  color: var(--accent-strong);
  background: var(--card-bg);
}
.database-connection-bar {
  border-radius: 5px;
  background: var(--surface-2);
}
.database-connection-bar > svg {
  color: var(--text-muted);
}
.database-connection-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 13px 16px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--card-bg);
}
.database-connection-bar > svg {
  width: 22px;
  height: 22px;
  color: var(--accent-strong);
}
.database-connection-bar > div {
  display: grid;
  gap: 3px;
  flex: 1;
}
.database-connection-bar span,
.database-explorer-sidebar-heading span,
.database-explorer-result-heading > span {
  color: var(--muted-text);
  font-size: 11px;
}
.database-connection-bar button svg {
  width: 14px;
  height: 14px;
}
.database-connection-disconnect {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}
.database-connection-disconnect:hover,
.database-connection-disconnect:focus-visible {
  color: var(--text);
  background: var(--surface-2);
}
.database-primary-button {
  color: var(--text-on-accent, #fff);
  border-color: var(--accent-strong);
  background: var(--accent-strong);
}
.database-explorer-empty {
  display: grid;
  grid-template-columns: 1fr 150px 1fr;
  align-items: center;
  min-height: 260px;
  margin-top: 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}
.database-explorer-empty-copy {
  padding: 32px;
}
.database-explorer-empty-copy-right {
  border-left: 1px solid var(--border-color);
}
.database-explorer-empty-copy h3,
.database-explorer-main-empty h3 {
  margin: 0 0 7px;
  font-size: 16px;
}
.database-explorer-empty-copy p,
.database-explorer-main-empty p {
  margin: 0 0 16px;
  color: var(--muted-text);
  font-size: 12px;
}
.database-explorer-empty-art {
  display: grid;
  place-items: center;
  width: 100px;
  height: 100px;
  justify-self: center;
  border-radius: 50%;
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.database-explorer-empty-art svg {
  width: 44px;
  height: 44px;
}
.database-explorer-workspace {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  min-height: 340px;
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}
.database-explorer-sidebar {
  padding: 18px;
  border-right: 1px solid var(--border-color);
}
.database-explorer-sidebar-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 18px;
}
.database-explorer-sidebar-heading div {
  display: grid;
  gap: 4px;
}
.database-explorer-sidebar-heading svg {
  width: 15px;
  height: 15px;
}
.database-explorer-select-label,
.database-explorer-query-box label {
  display: grid;
  gap: 6px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-explorer-sidebar select,
.database-explorer-query-box textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
}
.database-explorer-table-list {
  display: grid;
  gap: 4px;
  margin-top: 22px;
}
.database-explorer-table-search {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-explorer-table-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 9px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
}
.database-explorer-table-list > span {
  margin-bottom: 5px;
  color: var(--muted-text);
  font-size: 11px;
  font-weight: 600;
}
.database-explorer-table-list button {
  padding: 8px 9px;
  border: 0;
  border-radius: 5px;
  color: var(--text);
  background: transparent;
  text-align: left;
  font-size: 12px;
}
.database-explorer-table-list button:hover,
.database-explorer-table-list button.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.database-explorer-table-list p {
  color: var(--muted-text);
  font-size: 12px;
}
.database-explorer-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 8px;
  color: var(--muted-text);
  font-size: 10px;
}
.database-explorer-pagination button {
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text);
  background: var(--surface-2);
  font-size: 10px;
}
.database-explorer-pagination button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.database-explorer-main {
  min-width: 0;
  padding: 20px;
}
.database-explorer-main-empty {
  display: grid;
  place-items: center;
  align-content: center;
  min-height: 300px;
  text-align: center;
}
.database-explorer-main-empty svg {
  width: 40px;
  height: 40px;
  margin-bottom: 12px;
  color: var(--muted-text);
}
.database-explorer-result-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.database-explorer-result-heading div {
  display: grid;
  gap: 4px;
}
.database-explorer-result-heading div span {
  color: var(--muted-text);
  font-size: 11px;
}
.database-explorer-result-heading h3 {
  margin: 0;
}
.database-explorer-query-box {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}
.database-explorer-query-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.database-explorer-query-heading span {
  color: var(--muted-text);
  font-size: 11px;
}
.database-explorer-query-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.database-explorer-query-box button {
  min-height: 32px;
}
.database-modal-backdrop {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  overflow-y: auto;
  padding: 24px;
  background: rgb(0 0 0 / 62%);
}
.database-connection-modal {
  width: min(720px, 100%);
  max-height: min(760px, calc(100dvh - 48px));
  box-sizing: border-box;
  overflow-y: auto;
  padding: 28px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-2);
}
.database-modal-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 22px;
}
.database-modal-heading h2 {
  margin: 8px 0 6px;
  color: var(--text);
  font-size: 22px;
  letter-spacing: -0.02em;
}
.database-modal-heading p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.45;
}
.database-modal-heading > button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  margin: -4px -4px 0 0;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}
.database-modal-heading > button:hover,
.database-modal-heading > button:focus-visible {
  color: var(--text);
  background: var(--surface-2);
}
.database-connection-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.database-saved-connections {
  display: grid;
  grid-column: 1 / -1;
  gap: 7px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}
.database-saved-connections label {
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.database-saved-connection-control {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.database-saved-connection-control select {
  flex: 1 1 auto;
  min-width: 0;
}
.database-saved-remove {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
  cursor: pointer;
}
.database-connection-form label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}
.database-connection-form input,
.database-connection-form select {
  width: 100%;
  box-sizing: border-box;
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
}
.database-connection-form input:focus,
.database-connection-form select:focus,
.database-saved-remove:focus-visible {
  border-color: var(--accent);
  outline: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
  outline-offset: 1px;
}
.database-machine-details-error,
.database-machine-success {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--font-sm);
  line-height: 1.45;
}
.database-machine-details-error {
  border: 1px solid var(--danger-text);
  color: var(--danger-text);
  background: var(--danger-surface);
}
.database-machine-success {
  border: 1px solid var(--success-text);
  color: var(--success-text);
  background: var(--success-surface);
}
.database-modal-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
@media (max-width: 760px) {
  .database-machine-page {
    padding: 22px 16px 40px;
  }
  .database-machine-card {
    grid-template-columns: 42px minmax(0, 1fr);
  }
  .database-machine-actions,
  .database-machine-details {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
  .database-explorer-empty,
  .database-explorer-workspace {
    grid-template-columns: 1fr;
  }
  .database-explorer-empty-art {
    margin: 10px auto;
  }
  .database-explorer-empty-copy-right,
  .database-explorer-sidebar {
    border-top: 1px solid var(--border-color);
    border-left: 0;
  }
  .database-explorer-main {
    border-top: 1px solid var(--border-color);
  }
  .database-connection-form {
    grid-template-columns: 1fr;
  }
  .database-modal-backdrop {
    align-items: start;
    padding: 12px;
  }
  .database-connection-modal {
    max-height: calc(100dvh - 24px);
    padding: 20px;
  }
  .database-modal-actions {
    justify-content: stretch;
  }
  .database-modal-actions button {
    flex: 1 1 calc(50% - 8px);
  }
}
.database-machine-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.database-machine-eyebrow {
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.database-machine-header h1 {
  margin: 6px 0 4px;
}
.database-machine-header p {
  margin: 0;
  color: var(--muted-text);
}
.database-machine-refresh,
.database-machine-actions button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.database-machine-refresh svg,
.database-machine-actions svg {
  width: 16px;
  height: 16px;
}
.database-machine-refresh .is-spinning {
  animation: database-machine-spin 900ms linear infinite;
}
.database-machine-success {
  margin: -6px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--success-text);
  border-radius: 8px;
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 10%, transparent);
  font-size: 11px;
}
.database-machine-success span {
  margin-left: 6px;
  color: var(--muted-text);
}
.database-machine-list {
  display: grid;
  gap: 12px;
  max-width: 1120px;
}
.database-machine-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 1120px;
  margin: 28px 0 30px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  overflow: hidden;
}
.database-machine-overview-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-right: 1px solid var(--border-color);
}
.database-machine-overview-item:last-child {
  border-right: 0;
}
.database-machine-overview-item span {
  color: var(--muted-text);
  font-size: 12px;
  font-weight: 600;
}
.database-machine-overview-item strong {
  color: var(--text);
  font-size: 22px;
  line-height: 1;
}
.database-machine-overview-item strong.is-success {
  color: var(--success-text);
}
.database-machine-section {
  max-width: 1120px;
  margin-bottom: 10px;
}
.database-machine-section-available {
  margin-top: 34px;
}
.database-machine-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.database-machine-section-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
}
.database-machine-section-heading p {
  margin: 4px 0 0;
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-count {
  flex: 0 0 auto;
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  min-height: 78px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}
.database-machine-card-uninstalled {
  background: color-mix(in srgb, var(--card-bg) 72%, var(--accent-soft));
}
.database-machine-card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  height: 42px;
  border-radius: 10px;
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.database-machine-card-icon svg {
  width: 22px;
  height: 22px;
}
.database-machine-card-copy {
  min-width: 0;
  flex: 1;
}
.database-machine-card-copy h2 {
  margin: 0;
  font-size: 15px;
}
.database-machine-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.database-machine-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-meta span {
  padding-left: 8px;
  border-left: 1px solid var(--border-color);
}
.database-machine-status {
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-status::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--muted-text);
}
.database-machine-status.active {
  color: var(--success-text);
}
.database-machine-status.active::before {
  background: var(--success-text);
}
.database-machine-title-line .database-machine-status {
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
}
.database-machine-title-line .database-machine-status::before {
  width: 6px;
  height: 6px;
}
.database-machine-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.database-machine-details-toggle svg,
.database-machine-details-toolbar svg {
  width: 15px;
  height: 15px;
}
.database-machine-details-toggle svg:last-child {
  margin-left: -2px;
}
.database-machine-details {
  flex: 0 0 100%;
  margin: 2px 0 0 58px;
  padding: 14px 0 0;
  border-top: 1px solid var(--border-color);
}
.database-machine-details-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.database-machine-details-grid div {
  display: grid;
  gap: 4px;
}
.database-machine-details-grid span,
.database-machine-log-heading small {
  color: var(--muted-text);
  font-size: 11px;
}
.database-machine-details-grid strong {
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.database-machine-reachability-reachable {
  color: var(--success-text) !important;
}
.database-machine-reachability-unreachable {
  color: var(--error-text) !important;
}
.database-machine-details-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-machine-details-toolbar button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.database-machine-details-error {
  margin: 10px 0 0;
  color: var(--error-text);
  font-size: 11px;
}
.database-machine-log {
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-2);
}
.database-machine-log-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
}
.database-machine-log pre {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  padding: 10px;
  color: var(--text-muted);
  font:
    11px/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.database-machine-log > p {
  margin: 0;
  padding: 12px 10px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-machine-actions .danger {
  color: var(--error-text);
}
@keyframes database-machine-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 680px) {
  .database-machine-header,
  .database-machine-card {
    align-items: stretch;
    flex-direction: column;
  }
  .database-machine-actions {
    justify-content: flex-start;
  }
  .database-machine-details {
    margin-left: 0;
  }
  .database-machine-details-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .database-machine-overview {
    grid-template-columns: 1fr;
  }
  .database-machine-overview-item {
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }
  .database-machine-overview-item:last-child {
    border-bottom: 0;
  }
  .database-machine-section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
}

/* Keep the v2 layout rules last so legacy card rules cannot override them. */
.database-machine-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 32px 28px 56px;
}
.database-machine-list {
  max-width: none;
  gap: 0;
  border-top: 1px solid var(--border-color);
}
.database-machine-card {
  display: grid;
  grid-template-columns: 44px minmax(220px, 1fr) auto;
  align-items: center;
  min-height: 86px;
  padding: 16px 0;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  background: transparent;
}
.database-machine-details {
  grid-column: 2 / -1;
  width: auto;
  margin: 0 0 4px;
}
.database-explorer {
  max-width: none;
}
@media (max-width: 680px) {
  .database-machine-card {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: start;
  }
  .database-machine-actions,
  .database-machine-details {
    grid-column: 1 / -1;
  }
}
/* Prototype 2 visual alignment. */
.database-machine-page {
  max-width: none;
  margin: 0;
  padding: 32px 28px 56px;
}
.database-machine-header {
  margin-bottom: 34px;
  padding-bottom: 0;
  border-bottom: 0;
}
.database-machine-overview {
  display: none;
}
.database-machine-section-heading {
  margin: 0 0 16px;
}
.database-machine-section-available {
  margin-top: 34px;
}
.database-machine-card {
  min-height: 76px;
}
.database-machine-actions button {
  border-radius: 4px;
}
.database-explorer {
  max-width: none;
  margin-top: 34px;
  padding-top: 0;
  border-top: 0;
}
.database-connection-button {
  color: var(--text);
  border-color: var(--border-color);
  background: var(--card-bg);
}
.database-connection-bar {
  border-radius: 5px;
  background: var(--surface-2);
}
.database-connection-bar > svg {
  color: var(--text-muted);
}
.database-explorer-empty {
  min-height: 382px;
  border-radius: 0;
  background: var(--card-bg);
}
.database-explorer-empty-copy {
  display: grid;
  justify-items: center;
  align-content: center;
  min-height: 100%;
  padding: 28px;
  text-align: center;
}
.database-explorer-empty-copy-right {
  border-left: 1px solid var(--border-color);
}
.database-explorer-empty-art {
  position: relative;
  width: 86px;
  height: 86px;
}
.database-explorer-empty-art svg {
  position: absolute;
  width: 42px;
  height: 42px;
}
.database-explorer-empty-art svg:last-child {
  right: 4px;
  bottom: 4px;
  width: 28px;
  height: 28px;
  padding: 4px;
  border-radius: 50%;
  color: var(--accent-strong);
  background: var(--card-bg);
}
@media (max-width: 680px) {
  .database-machine-page {
    padding: 22px 16px 40px;
  }
}

/* Final visual pass: preserve the prototype hierarchy while keeping dense
   service data and long database names inside their own regions. */
.database-machine-page {
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  padding: 36px 40px 72px;
}
.database-machine-header {
  align-items: flex-start;
  margin-bottom: 42px;
}
.database-machine-header h1 {
  margin: 8px 0 6px;
  font-size: clamp(28px, 3vw, 38px);
  letter-spacing: -0.025em;
}
.database-machine-header p {
  max-width: 620px;
  line-height: 1.55;
}
.database-machine-refresh {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
}
.database-machine-section-heading {
  margin-bottom: 18px;
}
.database-machine-section-heading h2 {
  font-size: 16px;
  letter-spacing: -0.01em;
}
.database-machine-section-heading p {
  line-height: 1.45;
}
.database-machine-count {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-dim);
  background: var(--surface-1);
  font-size: 10px;
}
.database-machine-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}
.database-machine-card {
  min-width: 0;
  min-height: 82px;
  padding: 16px 18px;
  transition: background 160ms ease;
}
.database-machine-card:hover {
  background: var(--surface-2);
}
.database-machine-card + .database-machine-card {
  border-top: 1px solid var(--border);
}
.database-machine-card-icon {
  flex-basis: 40px;
  width: 40px;
  height: 40px;
  border-radius: 10px;
}
.database-machine-card-copy {
  overflow: hidden;
}
.database-machine-card-copy h2,
.database-machine-meta code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.database-machine-actions {
  max-width: 560px;
}
.database-machine-actions button {
  min-height: 32px;
  border-color: var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.database-machine-actions button:hover {
  border-color: var(--accent);
  color: var(--text);
  background: var(--surface-3);
}
.database-machine-section-available {
  margin-top: 42px;
}
.database-machine-card-uninstalled {
  background: color-mix(in srgb, var(--surface-1) 86%, var(--accent-soft));
}
.database-explorer {
  margin-top: 42px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}
.database-explorer > .database-machine-section-heading {
  margin: 0 0 18px;
}
.database-connection-bar {
  margin-top: 0;
  border-color: var(--border-strong);
  background: var(--surface-2);
}
.database-explorer-workspace {
  grid-template-columns: minmax(220px, 270px) minmax(0, 1fr);
  min-height: 420px;
  border-color: var(--border-strong);
  background: var(--surface-0);
}
.database-explorer-sidebar {
  min-width: 0;
  max-height: 620px;
  overflow: hidden auto;
  scrollbar-color: var(--border-strong) transparent;
}
.database-explorer-sidebar-heading {
  position: sticky;
  z-index: 1;
  top: -18px;
  margin: -18px -18px 18px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}
.database-explorer-table-list {
  min-width: 0;
  max-height: 470px;
  overflow: auto;
  scrollbar-color: var(--border-strong) transparent;
}
.database-explorer-table-list button {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.database-explorer-main {
  min-width: 0;
  overflow: hidden;
  background: var(--surface-1);
}
.database-explorer-result-heading {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.database-explorer-result-heading h3 {
  font-size: 18px;
  letter-spacing: -0.01em;
}
.database-explorer-table-wrap {
  max-width: 100%;
  max-height: 380px;
  overflow: auto;
  border-color: var(--border-strong);
  scrollbar-color: var(--border-strong) var(--surface-2);
}
.database-explorer table {
  min-width: max-content;
}
.database-explorer th {
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--text);
  background: var(--surface-2);
  font-size: 11px;
  font-weight: 700;
}
.database-explorer td {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.database-explorer-query-box {
  padding-top: 4px;
}
.database-explorer-query-box textarea {
  min-height: 86px;
  resize: vertical;
  border-color: var(--border-strong);
  background: var(--surface-2);
}
.database-explorer-result-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 14px 0;
}
.database-explorer-result-tools > label {
  display: flex;
  min-width: 220px;
  align-items: center;
  gap: 7px;
  flex: 1;
}
.database-explorer-result-tools > label svg {
  width: 15px;
  height: 15px;
  color: var(--text-muted);
}
.database-explorer-result-tools input {
  width: 100%;
  min-height: 32px;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
  font: inherit;
}
.database-explorer-result-tools > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.database-explorer-result-tools button,
.database-explorer-query-heading > button,
.database-explorer-history-heading button {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-2);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.database-explorer-result-tools button:hover,
.database-explorer-query-heading > button:hover,
.database-explorer-history-heading button:hover:not(:disabled) {
  border-color: var(--accent-strong);
  background: var(--accent-soft);
}
.database-explorer-result-tools > div > span {
  color: var(--success-text);
  font-size: 10px;
}
.database-explorer th button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: inherit;
}
.database-explorer th button svg {
  width: 13px;
  height: 13px;
  color: var(--accent);
}
.database-explorer-query-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.database-explorer-query-heading > div {
  display: grid;
  gap: 4px;
}
.database-explorer-query-heading > div > span {
  color: var(--text-muted);
  font-size: 10px;
}
.database-explorer-history {
  display: grid;
  gap: 8px;
  max-height: 250px;
  overflow: auto;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}
.database-explorer-history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
}
.database-explorer-history-heading button {
  min-height: 26px;
  color: var(--text-muted);
  font-size: 10px;
}
.database-explorer-history > p {
  margin: 4px 0;
  color: var(--text-muted);
  font-size: 11px;
}
.database-explorer-history-item {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.database-explorer-history-item > button:not(.database-explorer-history-query) {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}
.database-explorer-history-item > button:hover {
  color: var(--accent);
}
.database-explorer-history-query {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  flex: 1;
  padding: 7px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.database-explorer-history-query:hover {
  background: var(--surface-2);
}
.database-explorer-history-query strong {
  flex: 0 0 auto;
  color: var(--warning-text);
}
.database-explorer-history-query code {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  padding: 0;
  border: 0;
  margin: -1px;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (max-width: 820px) {
  .database-machine-page {
    padding: 24px 18px 48px;
  }
  .database-machine-header {
    margin-bottom: 30px;
  }
  .database-machine-card {
    grid-template-columns: 40px minmax(0, 1fr);
  }
  .database-machine-actions {
    max-width: none;
  }
  .database-explorer {
    padding: 16px;
  }
  .database-explorer-sidebar-heading {
    top: -16px;
    margin: -16px -16px 16px;
    padding: 16px 16px 12px;
  }
  .database-explorer-result-tools {
    align-items: stretch;
    flex-direction: column;
  }
  .database-explorer-result-tools > label {
    min-width: 0;
  }
  .database-explorer-result-tools > div {
    justify-content: flex-end;
  }
}
</style>
