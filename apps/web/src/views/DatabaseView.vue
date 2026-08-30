<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  ChevronDownIcon,
  CircleStackIcon,
  LinkIcon,
  MagnifyingGlassIcon,
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
import DatabaseConnectionDialog from '../components/database/DatabaseConnectionDialog.vue';
import DatabaseExplorerSidebar from '../components/database/DatabaseExplorerSidebar.vue';
import DatabaseQueryEditor from '../components/database/DatabaseQueryEditor.vue';
import DatabaseResultTable from '../components/database/DatabaseResultTable.vue';
import DatabaseServicesPanel from '../components/database/DatabaseServicesPanel.vue';
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

function updateExplorerDraft(draft: MachineDatabaseConnection): void {
  explorerDraft.value = draft;
}

function syncExplorerPort(driver: MachineDatabaseConnection['driver']): void {
  explorerDraft.value = {
    ...explorerDraft.value,
    driver,
    port: driver === 'postgresql' ? 5432 : 3306,
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
  if (!details.value[serviceId]) await loadDetails(serviceId);
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
    <DatabaseServicesPanel
      :services="services"
      :loading="loading"
      :error-message="errorMessage"
      :success-message="successMessage"
      :last-updated-at="lastUpdatedAt"
      :expanded-service-id="expandedServiceId"
      :details="details"
      :details-errors="detailsErrors"
      :details-loading="detailsLoading"
      :pending="pending"
      @refresh="refreshServices"
      @run-action="runAction"
      @toggle-details="toggleDetails"
      @reload-details="loadDetails"
      @install="installService"
      @uninstall="uninstallService"
    />
    <section
      v-if="!loading || services.length > 0"
      class="database-explorer"
      aria-labelledby="database-explorer-title"
    >
      <div class="database-machine-section-heading">
        <div>
          <h2 id="database-explorer-title">Explorador de dados</h2>
          <p>
            Acesso local somente leitura. Credenciais ficam apenas nesta sessão.
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
    @update:draft="updateExplorerDraft"
    @update-driver="syncExplorerPort"
    @select-saved="applySavedConnection"
    @remove-saved="removeSavedConnection"
    @save="saveExplorerConnection"
    @test="testExplorerConnection"
    @connect="connectExplorer"
  />
</template>

<style src="./DatabaseView.css"></style>
