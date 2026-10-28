<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowPathIcon, CircleStackIcon } from '@heroicons/vue/24/outline';
import type {
  MachineDatabaseConnection,
  MachineDatabaseService,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

import { formatDatabaseExplorerError } from '../api/database-explorer-errors';
import DatabaseConnectionDialog from '../components/database/DatabaseConnectionDialog.vue';
import DatabaseQueryEditor from '../components/database/DatabaseQueryEditor.vue';
import DatabaseResultTable from '../components/database/DatabaseResultTable.vue';
import DatabaseRowInspector from '../components/database/DatabaseRowInspector.vue';
import DatabaseServiceDetailsDialog from '../components/database/DatabaseServiceDetailsDialog.vue';
import DatabaseSidebar from '../components/database/DatabaseSidebar.vue';
import UiButton from '../components/ui/UiButton.vue';
import {
  type DatabaseQueryHistoryItem,
  useDatabaseQueryHistory,
} from '../composables/useDatabaseQueryHistory';
import { useDatabaseExplorerSession } from '../composables/useDatabaseExplorerSession';
import { useDatabaseQueryExecution } from '../composables/useDatabaseQueryExecution';
import { useDatabaseResultView } from '../composables/useDatabaseResultView';
import { useDatabaseSavedConnections } from '../composables/useDatabaseSavedConnections';
import { useDatabaseTableListView } from '../composables/useDatabaseTableListView';
import { useMachineDatabaseServices } from '../composables/useMachineDatabaseServices';

type ExplorerDriver = MachineDatabaseConnection['driver'];
type WorkspaceTab = 'data' | 'query';

const defaultPorts: Record<ExplorerDriver, number> = {
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  redis: 6379,
};

const {
  services,
  loading,
  errorMessage,
  successMessage,
  details,
  detailsErrors,
  detailsLoading,
  pending,
  loadServices,
  refreshServices,
  loadDetails,
  runAction,
  uninstallService,
} = useMachineDatabaseServices();

const installedServices = computed(() =>
  services.value.filter((service) => service.installed),
);
const detailsServiceId = ref<string | null>(null);
const detailsService = computed(
  () =>
    installedServices.value.find(
      (service) => service.id === detailsServiceId.value,
    ) ?? null,
);

const activeServiceId = ref<string | null>(null);
const activeTab = ref<WorkspaceTab>('data');
const explorerModalOpen = ref(false);
const explorerLoading = ref(false);
const explorerError = ref('');
const explorerTestMessage = ref('');
const explorerDraft = ref<MachineDatabaseConnection>({
  driver: 'postgresql',
  host: '127.0.0.1',
  port: 5432,
});
const explorerDatabases = ref<{ name: string }[]>([]);
const explorerTables = ref<MachineDatabaseTable[]>([]);
const explorerDatabase = ref('');
const explorerTable = ref('');
const explorerQuery = ref('SELECT * FROM ');
const explorerHistoryOpen = ref(false);
const selectedRow = ref<number | null>(null);
const queryTable = ref('');
const queryTables = ref<MachineDatabaseTable[]>([]);

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

const dataView = useDatabaseResultView();
const queryView = useDatabaseResultView();

const {
  connections: savedConnections,
  selectedId: selectedSavedConnectionId,
  load: loadSavedConnections,
  save: saveDatabaseConnection,
  select: selectSavedConnection,
  remove: removeDatabaseSavedConnection,
} = useDatabaseSavedConnections();

const {
  history: explorerQueryHistory,
  recent: recentExplorerQueries,
  savedQueries: savedExplorerQueries,
  load: loadExplorerQueryHistory,
  remember: rememberDatabaseQuery,
  toggleFavorite: toggleExplorerQueryFavorite,
  remove: removeExplorerQueryHistory,
  clear: clearExplorerQueryHistory,
} = useDatabaseQueryHistory();

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

const isRedis = computed(
  () =>
    (explorerConnection.value?.driver ?? explorerDraft.value.driver) ===
    'redis',
);

function defaultQuery(driver: ExplorerDriver): string {
  return driver === 'redis' ? 'GET ' : 'SELECT * FROM ';
}

function queryForTable(table: MachineDatabaseTable): string {
  if (explorerConnection.value?.driver === 'redis') {
    return `TYPE ${table.name}`;
  }
  return `SELECT * FROM ${table.schema ? `${table.schema}.` : ''}${table.name}`;
}

function resetExplorerQuery(): void {
  explorerQuery.value = defaultQuery(
    explorerConnection.value?.driver ?? explorerDraft.value.driver,
  );
}

function rememberExplorerQuery(): void {
  if (!explorerConnection.value) return;
  rememberDatabaseQuery({
    query: explorerQuery.value,
    driver: explorerConnection.value.driver,
    database: explorerDatabase.value,
    table: explorerTable.value,
  });
}

const sharedExecution = {
  sessionId: explorerSessionId,
  database: explorerDatabase,
  query: explorerQuery,
  loading: explorerLoading,
  error: explorerError,
  resetQuery: resetExplorerQuery,
  handleSessionError: handleExplorerSessionError,
  clearCopiedMessage: () => {
    dataView.clearCopiedMessage();
    queryView.clearCopiedMessage();
  },
};

// Dados: lista de tabelas e prévia da tabela escolhida.
const dataExecution = useDatabaseQueryExecution({
  ...sharedExecution,
  table: explorerTable,
  tables: explorerTables,
  resetTableList: resetExplorerTableList,
  setResult: dataView.setResult,
  setDuration: dataView.setDuration,
  resetResultPresentation: dataView.resetPresentation,
  rememberQuery: () => undefined,
  queryForTable,
});

// Consulta: console somente leitura com resultado próprio.
const queryExecution = useDatabaseQueryExecution({
  ...sharedExecution,
  table: queryTable,
  tables: queryTables,
  resetTableList: () => undefined,
  setResult: queryView.setResult,
  setDuration: queryView.setDuration,
  resetResultPresentation: queryView.resetPresentation,
  rememberQuery: rememberExplorerQuery,
  queryForTable,
});

const activeView = computed(() =>
  activeTab.value === 'data' ? dataView : queryView,
);
const inspectedRow = computed(() => {
  const index = selectedRow.value;
  if (index === null) return null;
  return activeView.value.visibleRows.value[index] ?? null;
});

watch(
  [activeTab, () => dataView.result.value, () => queryView.result.value],
  () => {
    selectedRow.value = null;
  },
);

function selectTable(table: MachineDatabaseTable): void {
  activeTab.value = 'data';
  dataExecution.selectTable(table);
}

async function runQuery(): Promise<void> {
  activeTab.value = 'query';
  await queryExecution.runQuery();
}

function invalidateExecutions(): void {
  dataExecution.invalidate();
  queryExecution.invalidate();
}

function restoreExplorerQuery(item: DatabaseQueryHistoryItem): void {
  explorerQuery.value = item.query;
  queryView.clear();
  if (
    item.database &&
    explorerDatabases.value.some((database) => database.name === item.database)
  ) {
    explorerDatabase.value = item.database;
  }
  explorerHistoryOpen.value = false;
  explorerError.value = '';
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

function clearExplorerData(showExpiryMessage = false): void {
  invalidateExecutions();
  activeServiceId.value = null;
  explorerDatabases.value = [];
  explorerTables.value = [];
  explorerDatabase.value = '';
  explorerTable.value = '';
  resetExplorerTableList();
  dataView.clear();
  queryView.clear();
  explorerTestMessage.value = '';
  explorerDraft.value = {
    driver: explorerDraft.value.driver,
    ...(explorerDraft.value.host ? { host: explorerDraft.value.host } : {}),
    ...(explorerDraft.value.port ? { port: explorerDraft.value.port } : {}),
  };
  resetExplorerQuery();
  activeTab.value = 'data';
  if (showExpiryMessage) {
    explorerError.value =
      'A sessão foi encerrada por inatividade. Conecte-se novamente para continuar.';
  }
}

async function disconnectExplorer(): Promise<void> {
  if (explorerLoading.value) return;
  invalidateExecutions();
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

function explorableDriver(
  service: MachineDatabaseService,
): ExplorerDriver | null {
  return ['postgresql', 'mysql', 'mariadb', 'redis'].includes(service.driver)
    ? (service.driver as ExplorerDriver)
    : null;
}

let exploringServiceId: string | null = null;

function exploreService(service: MachineDatabaseService): void {
  const driver = explorableDriver(service);
  if (!driver) return;
  exploringServiceId = service.id;
  const saved = savedConnections.value.find((item) => item.driver === driver);
  explorerDraft.value = {
    driver,
    host: '127.0.0.1',
    port: details.value[service.id]?.port ?? defaultPorts[driver],
    ...(saved?.username ? { username: saved.username } : {}),
    ...(saved?.database ? { database: saved.database } : {}),
  };
  explorerModalOpen.value = true;
  explorerError.value = '';
  explorerTestMessage.value = '';
}

function openManualConnection(): void {
  exploringServiceId = null;
  explorerModalOpen.value = true;
  explorerError.value = '';
  explorerTestMessage.value = '';
}

function closeExplorerConnection(): void {
  if (!explorerLoading.value) explorerModalOpen.value = false;
}

function saveExplorerConnection(): void {
  saveDatabaseConnection(explorerDraft.value);
  explorerTestMessage.value = 'Conexão salva sem armazenar a senha.';
}

function applySavedConnection(id: string): void {
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

function syncExplorerPort(driver: ExplorerDriver): void {
  explorerDraft.value = {
    ...explorerDraft.value,
    driver,
    port: defaultPorts[driver],
  };
}

async function connectExplorer(): Promise<void> {
  invalidateExecutions();
  explorerLoading.value = true;
  explorerError.value = '';
  explorerTestMessage.value = '';
  dataView.clear();
  queryView.clear();
  try {
    const connection = { ...explorerDraft.value };
    explorerDatabases.value = await connectExplorerSession(connection);
    explorerDatabase.value = '';
    explorerTable.value = '';
    explorerTables.value = [];
    resetExplorerTableList();
    explorerDraft.value = connectionDraftWithoutSecret(connection);
    resetExplorerQuery();
    activeServiceId.value =
      exploringServiceId ??
      installedServices.value.find(
        (service) => service.driver === connection.driver,
      )?.id ??
      null;
    explorerModalOpen.value = false;
    // Um único banco (ex.: Redis db0) já abre direto na lista.
    const [only] = explorerDatabases.value;
    if (explorerDatabases.value.length === 1 && only) {
      void dataExecution.selectDatabase(only.name);
    } else if (connection.database) {
      void dataExecution.selectDatabase(connection.database);
    }
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

function showServiceDetails(service: MachineDatabaseService): void {
  detailsServiceId.value = service.id;
  if (!details.value[service.id]) void loadDetails(service.id);
}

const connectionLabel = computed(() => {
  const connection = explorerConnection.value;
  if (!connection) return 'Sem conexão';
  const target = `${connection.driver} · ${connection.host ?? '127.0.0.1'}:${connection.port ?? defaultPorts[connection.driver]}`;
  return explorerDatabase.value
    ? `${target} · ${explorerDatabase.value}`
    : target;
});

const statusSummary = computed(() => {
  const view = activeView.value;
  const result = view.result.value;
  if (!result) return '';
  const duration =
    view.durationMs.value !== null ? ` · ${view.durationMs.value} ms` : '';
  return `${result.rowCount} linha(s)${duration}`;
});

// Carrega porta e versão dos serviços em execução para mostrar na lateral.
watch(
  installedServices,
  async (list) => {
    for (const service of list) {
      if (service.active && !details.value[service.id]) {
        await loadDetails(service.id);
      }
    }
  },
  { immediate: true },
);

onMounted(() => {
  loadSavedConnections();
  loadExplorerQueryHistory();
  void loadServices();
});
</script>

<template>
  <section
    class="content database-page"
    aria-labelledby="database-page-title"
    :aria-busy="loading || explorerLoading"
  >
    <h1 id="database-page-title" class="sr-only">Banco de dados</h1>

    <div class="database-body">
      <DatabaseSidebar
        :services="installedServices"
        :details="details"
        :pending="pending"
        :active-service-id="explorerConnection ? activeServiceId : null"
        :databases="explorerDatabases"
        :tables="visibleExplorerTables"
        :filtered-table-count="filteredExplorerTables.length"
        :page="explorerTablePage"
        :page-count="explorerTablePageCount"
        :selected-database="explorerDatabase"
        :selected-table="explorerTable"
        :table-search="explorerTableSearch"
        :loading="explorerLoading"
        @explore="exploreService"
        @run-action="runAction"
        @show-details="showServiceDetails"
        @uninstall="uninstallService"
        @disconnect="disconnectExplorer"
        @select-database="dataExecution.selectDatabase"
        @select-table="selectTable"
        @search-table="setExplorerTableSearch"
        @previous-page="previousExplorerTablePage"
        @next-page="nextExplorerTablePage"
      />

      <main class="database-main">
        <p v-if="successMessage" class="database-notice" role="status">
          {{ successMessage }}
        </p>
        <p v-if="errorMessage" class="database-error" role="alert">
          {{ errorMessage }}
        </p>
        <p
          v-if="explorerError && !explorerModalOpen"
          class="database-error"
          role="alert"
        >
          {{ explorerError }}
        </p>

        <template v-if="explorerConnection">
          <div
            class="database-tabs"
            role="tablist"
            aria-label="Área de trabalho"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'data'"
              @click="activeTab = 'data'"
            >
              {{ explorerTable || (isRedis ? 'Chave' : 'Tabela') }}
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="activeTab === 'query'"
              @click="activeTab = 'query'"
            >
              Consulta
            </button>
            <UiButton
              class="database-refresh"
              icon
              variant="ghost"
              :disabled="loading"
              aria-label="Atualizar serviços"
              title="Atualizar serviços"
              @click="refreshServices"
            >
              <ArrowPathIcon
                :class="{ 'is-spinning': loading }"
                aria-hidden="true"
              />
            </UiButton>
          </div>

          <div
            v-show="activeTab === 'data'"
            class="database-panel"
            role="tabpanel"
          >
            <div v-if="!explorerTable" class="database-empty">
              <CircleStackIcon aria-hidden="true" />
              <h2>
                {{ isRedis ? 'Selecione uma chave' : 'Selecione uma tabela' }}
              </h2>
              <p>
                {{
                  explorerDatabase
                    ? 'Escolha um item na lista à esquerda para ver os dados.'
                    : 'Escolha um banco na lista à esquerda para começar.'
                }}
              </p>
            </div>
            <DatabaseResultTable
              v-else
              :result="dataView.result.value"
              :visible-rows="dataView.visibleRows.value"
              :duration-ms="dataView.durationMs.value"
              :search="dataView.search.value"
              :sort="dataView.sort.value"
              :copied-message="dataView.copiedMessage.value"
              :selected-row="selectedRow"
              @update:search="dataView.search.value = $event"
              @toggle-sort="dataView.toggleSort"
              @select-row="selectedRow = $event"
              @copy="dataView.copy"
              @export="dataView.exportResults"
            />
          </div>

          <div
            v-show="activeTab === 'query'"
            class="database-panel"
            role="tabpanel"
          >
            <DatabaseQueryEditor
              :query="explorerQuery"
              :loading="explorerLoading"
              :redis="isRedis"
              :history-open="explorerHistoryOpen"
              :history-count="explorerQueryHistory.length"
              :saved-queries="savedExplorerQueries"
              :recent-queries="recentExplorerQueries"
              @update:query="explorerQuery = $event"
              @toggle-history="explorerHistoryOpen = !explorerHistoryOpen"
              @clear-history="clearExplorerQueryHistory"
              @restore-query="restoreExplorerQuery"
              @toggle-favorite="toggleExplorerQueryFavorite"
              @remove-history="removeExplorerQueryHistory"
              @reset="resetExplorerQuery"
              @run="runQuery"
            />
            <DatabaseResultTable
              :result="queryView.result.value"
              :visible-rows="queryView.visibleRows.value"
              :duration-ms="queryView.durationMs.value"
              :search="queryView.search.value"
              :sort="queryView.sort.value"
              :copied-message="queryView.copiedMessage.value"
              :selected-row="selectedRow"
              @update:search="queryView.search.value = $event"
              @toggle-sort="queryView.toggleSort"
              @select-row="selectedRow = $event"
              @copy="queryView.copy"
              @export="queryView.exportResults"
            />
          </div>
        </template>

        <div v-else class="database-empty database-empty-start">
          <CircleStackIcon aria-hidden="true" />
          <h2>Explore seus bancos locais</h2>
          <p>
            Escolha um serviço em execução na lista à esquerda e clique nele
            para conectar em modo somente leitura.
          </p>
          <UiButton @click="openManualConnection"
            >Conectar manualmente</UiButton
          >
        </div>
      </main>

      <DatabaseRowInspector
        v-if="explorerConnection"
        :title="activeTab === 'data' ? explorerTable || 'Dados' : 'Consulta'"
        :columns="activeView.result.value?.columns ?? []"
        :row="inspectedRow"
        :row-number="selectedRow === null ? null : selectedRow + 1"
      />
    </div>

    <footer class="database-status">
      <strong>{{ connectionLabel }}</strong>
      <span v-if="explorerConnection">somente leitura</span>
      <span v-if="statusSummary">{{ statusSummary }}</span>
    </footer>
  </section>

  <DatabaseConnectionDialog
    :open="explorerModalOpen"
    :draft="explorerDraft"
    :saved-connections="savedConnections"
    :selected-saved-connection-id="selectedSavedConnectionId"
    :loading="explorerLoading"
    :error="explorerError"
    :test-message="explorerTestMessage"
    @close="closeExplorerConnection"
    @update:draft="explorerDraft = $event"
    @update-driver="syncExplorerPort"
    @select-saved="applySavedConnection"
    @remove-saved="removeDatabaseSavedConnection"
    @save="saveExplorerConnection"
    @test="testExplorerConnection"
    @connect="connectExplorer"
  />
  <DatabaseServiceDetailsDialog
    :service="detailsService"
    :details="detailsService ? details[detailsService.id] : undefined"
    :error="detailsService ? (detailsErrors[detailsService.id] ?? '') : ''"
    :loading="detailsLoading === detailsService?.id"
    @close="detailsServiceId = null"
    @reload="loadDetails"
  />
</template>

<style scoped>
.database-page {
  display: flex;
  height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  padding: 0;
  background: var(--surface-0);
}

.database-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
}

.database-main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  padding: 0 clamp(12px, 2vw, 24px) 24px;
  overflow-y: auto;
}

.database-tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  margin: 0 calc(-1 * clamp(12px, 2vw, 24px));
  padding: 10px clamp(12px, 2vw, 24px) 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
}

.database-tabs button[role='tab'] {
  height: 38px;
  max-width: 280px;
  padding: 0 16px;
  overflow: hidden;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.database-tabs button[role='tab'][aria-selected='true'] {
  border-color: var(--border);
  color: var(--text);
  background: var(--surface-1);
}

.database-refresh .is-spinning {
  animation: database-spin 800ms linear infinite;
}

@keyframes database-spin {
  to {
    transform: rotate(360deg);
  }
}

.database-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
}

.database-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 56px 24px;
  border: 1px dashed var(--border-strong);
  border-radius: 14px;
  color: var(--text-muted);
  text-align: center;
}

.database-empty svg {
  width: 36px;
  height: 36px;
  color: var(--accent);
}

.database-empty h2 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
}

.database-empty p {
  max-width: 46ch;
  margin: 0;
  font-size: 14px;
}

.database-empty-start {
  margin-top: 40px;
}

.database-notice,
.database-error {
  margin: 16px 0 0;
  padding: 10px 14px;
  border-radius: 9px;
  font-size: 13px;
}

.database-notice {
  color: var(--success-text);
  background: var(--success-surface);
}

.database-error {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.database-status {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 20px;
  padding: 8px var(--page-gutter);
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 12px;
}

.database-status strong {
  color: var(--text);
  font-family: var(--font-family-mono);
  font-weight: 600;
}

button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 900px) {
  .database-page {
    height: auto;
  }

  .database-body {
    flex-direction: column;
  }

  .database-main {
    overflow-y: visible;
  }
}

@media (prefers-reduced-motion: reduce) {
  .database-refresh .is-spinning {
    animation: none;
  }
}

.database-refresh {
  margin: 0 0 2px auto;
}
</style>
