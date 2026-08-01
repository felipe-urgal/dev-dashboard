<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';
import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CircleStackIcon,
  ClipboardDocumentIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PauseIcon,
  PlayIcon,
  ServerStackIcon,
  TableCellsIcon,
} from '@heroicons/vue/24/outline';

import type {
  DatabaseServiceAction,
  Project,
  ProjectDatabaseEnvironment,
  RailsMigrationEntry,
  RailsSchemaTable,
} from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectDatabaseOverview } from '../composables/useProjectDatabaseOverview';
import { useProjectDatabaseSnapshots } from '../composables/useProjectDatabaseSnapshots';
import { useRailsMigrations } from '../composables/useRailsMigrations';
import { useRailsModels } from '../composables/useRailsModels';
import { dbReachabilityToneFor, railsMigrationToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

type DatabaseSection = 'overview' | 'environments' | 'snapshots' | 'migrations' | 'models';
type MigrationStatusFilter = 'all' | 'up' | 'down';

const isRailsProject = computed(() => props.project.type === 'rails');

const {
  overview,
  loading,
  errorMessage,
  revealed,
  page,
  pendingAction,
  selectedEnvironmentId,
  loadDatabase,
  reveal,
  runAction,
} = useProjectDatabaseOverview(() => props.project);

const {
  migrations,
  migrationsLoading,
  migrationsErrorMessage,
  migrationDetail,
  migrationDetailLoading,
  migrationDetailErrorMessage,
  selectedMigrationVersion,
  mutationRunning,
  mutationMessage,
  mutationErrorMessage,
  mutationOutput,
  mutationLabels,
  loadMigrations,
  selectMigration,
  runMigrationMutation,
} = useRailsMigrations(() => props.project, isRailsProject);

const {
  models,
  modelsLoading,
  modelsErrorMessage,
  selectedTableName,
  loadModels,
} = useRailsModels(() => props.project, isRailsProject);

const {
  snapshots,
  snapshotsLoading,
  snapshotsErrorMessage,
  snapshotsMessage,
  snapshotsSupported,
  snapshotEnvironmentId,
  creatingSnapshot,
  restoringSnapshotId,
  pendingRestoreId,
  loadSnapshots,
  createSnapshot,
  requestRestore,
  cancelRestore,
  confirmRestore,
} = useProjectDatabaseSnapshots(() => props.project, selectedEnvironmentId);

const activeSection = ref<DatabaseSection>('overview');
const globalFilter = ref('');
const migrationFilter = ref('');
const migrationStatusFilter = ref<MigrationStatusFilter>('all');
const modelFilter = ref('');

const copiedKey = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

useAutoDismiss(errorMessage, '');
useAutoDismiss(migrationsErrorMessage, '');
useAutoDismiss(migrationDetailErrorMessage, '');
useAutoDismiss(modelsErrorMessage, '');
useAutoDismiss(mutationMessage, '');
useAutoDismiss(mutationErrorMessage, '');
useAutoDismiss(snapshotsErrorMessage, '');
useAutoDismiss(snapshotsMessage, '');

const pages = computed(() => Math.max(1, Math.ceil((overview.value?.total ?? 0) / (overview.value?.pageSize ?? 20))));
const pendingMigrationsCount = computed(() => migrations.value?.migrations.filter((item) => item.status === 'down').length ?? 0);
const appliedMigrationsCount = computed(() => migrations.value?.migrations.filter((item) => item.status === 'up').length ?? 0);
const reachableEnvironmentsCount = computed(() => overview.value?.environments.filter((item) => item.reachability === 'reachable').length ?? 0);
const totalColumns = computed(() => models.value?.tables.reduce((total, table) => total + table.columns.length, 0) ?? 0);
const totalIndexes = computed(() => models.value?.tables.reduce((total, table) => total + table.indexes.length, 0) ?? 0);
const totalRelations = computed(() => models.value?.tables.reduce((total, table) => total + table.foreignKeys.length, 0) ?? 0);

const reachabilityLabels = { reachable: 'Acessível', unreachable: 'Indisponível', unknown: 'Não verificado' } as const;
const migrationStatusLabels = { up: 'Aplicada', down: 'Pendente' } as const;
const serviceActionLabels: Record<DatabaseServiceAction, string> = { start: 'Iniciando…', stop: 'Pausando…', restart: 'Reiniciando…' };

const sectionTabs = computed(() => [
  { id: 'overview' as const, label: 'Visão geral', icon: CircleStackIcon },
  { id: 'environments' as const, label: 'Ambientes', icon: ServerStackIcon },
  { id: 'snapshots' as const, label: 'Snapshots', icon: ArchiveBoxIcon },
  ...(isRailsProject.value ? [
    { id: 'migrations' as const, label: 'Migrations', icon: DocumentTextIcon },
    { id: 'models' as const, label: 'Modelos', icon: TableCellsIcon },
  ] : []),
]);

const sectionTitle = computed(() => ({
  overview: 'Banco de dados do projeto',
  environments: 'Ambientes',
  snapshots: 'Snapshots',
  migrations: 'Migrations',
  models: 'Modelos',
})[activeSection.value]);

const sectionDescription = computed(() => ({
  overview: 'Visão consolidada de ambientes, migrations e modelos.',
  environments: 'Gerencie conexões, credenciais e disponibilidade dos bancos detectados.',
  snapshots: 'Guarde o estado do banco antes de trocar de branch e restaure quando precisar.',
  migrations: 'Acompanhe o status e consulte o código-fonte de cada migration.',
  models: 'Explore as tabelas do schema, suas colunas, índices e relacionamentos.',
})[activeSection.value]);

const isRefreshing = computed(() => loading.value || migrationsLoading.value || modelsLoading.value);

function snapshotMoment(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data desconhecida'
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function activeQuery(localValue: string): string {
  return (localValue.trim() || globalFilter.value.trim()).toLowerCase();
}

const filteredMigrations = computed(() => {
  const query = activeQuery(migrationFilter.value);
  return (migrations.value?.migrations ?? []).filter((entry) => {
    const statusMatches = migrationStatusFilter.value === 'all' || entry.status === migrationStatusFilter.value;
    const queryMatches = !query || entry.version.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query);
    return statusMatches && queryMatches;
  });
});

const filteredTables = computed(() => {
  const query = activeQuery(modelFilter.value);
  if (!query) return models.value?.tables ?? [];
  return (models.value?.tables ?? []).filter((table) =>
    table.name.toLowerCase().includes(query)
    || table.columns.some((column) => column.name.toLowerCase().includes(query)),
  );
});

const selectedEnvironment = computed<ProjectDatabaseEnvironment | null>(() =>
  overview.value?.environments.find((item) => item.id === selectedEnvironmentId.value)
  ?? overview.value?.environments[0]
  ?? null,
);

const selectedMigrationEntry = computed<RailsMigrationEntry | null>(() =>
  migrations.value?.migrations.find((item) => item.version === selectedMigrationVersion.value)
  ?? migrations.value?.migrations[0]
  ?? null,
);

const selectedTable = computed<RailsSchemaTable | null>(() =>
  models.value?.tables.find((table) => table.name === selectedTableName.value)
  ?? models.value?.tables[0]
  ?? null,
);

/** Ambientes locais que compartilham o mesmo serviço systemd do ambiente selecionado: pausar ou reiniciar um afeta os outros. */
const systemdServiceByDriver: Record<string, string> = {
  mariadb: 'mariadb.service',
  mongodb: 'mongod.service',
  mysql: 'mysql.service',
  mysql2: 'mysql.service',
  postgres: 'postgresql.service',
  postgresql: 'postgresql.service',
  redis: 'redis-server.service',
};

function systemdServiceFor(item: ProjectDatabaseEnvironment): string | null {
  return item.serviceAvailable ? systemdServiceByDriver[item.driver.toLowerCase()] ?? null : null;
}

const sharedServiceEnvironments = computed<ProjectDatabaseEnvironment[]>(() => {
  const env = selectedEnvironment.value;
  if (!env) return [];
  const service = systemdServiceFor(env);
  if (!service) return [];
  return (overview.value?.environments ?? []).filter((item) => item.id !== env.id && systemdServiceFor(item) === service);
});

async function refreshAll(): Promise<void> {
  await Promise.all([
    loadDatabase(1),
    loadMigrations(),
    loadModels(),
  ]);
}

async function refreshActive(): Promise<void> {
  if (activeSection.value === 'overview') return refreshAll();
  if (activeSection.value === 'environments') return loadDatabase();
  if (activeSection.value === 'snapshots') return loadSnapshots();
  if (activeSection.value === 'migrations') return loadMigrations();
  return loadModels();
}

function selectSection(section: DatabaseSection): void {
  activeSection.value = section;
}

async function copy(value: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    copiedKey.value = key;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copiedKey.value = ''; }, 1_800);
  } catch {
    copiedKey.value = '';
  }
}

function columnTypeLabel(table: RailsSchemaTable, columnName: string): string {
  const column = table.columns.find((item) => item.name === columnName);
  if (!column) return '—';
  const details = [column.type];
  if (column.limit) details.push(String(column.limit));
  if (column.precision) details.push(`${column.precision}${column.scale !== undefined ? `,${column.scale}` : ''}`);
  return details.length > 1 ? `${details[0]}(${details.slice(1).join(', ')})` : details[0] ?? '—';
}

watch(() => props.project.id, () => {
  activeSection.value = 'overview';
  globalFilter.value = '';
  migrationFilter.value = '';
  modelFilter.value = '';
}, { immediate: true });

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template>
  <section class="database-explorer" aria-labelledby="database-explorer-title">
    <header class="database-explorer-header">
      <div class="database-explorer-heading">
        <span class="database-explorer-breadcrumb">Projeto / Banco de dados</span>
        <h3 id="database-explorer-title">{{ sectionTitle }}</h3>
        <p>{{ sectionDescription }}</p>
      </div>

      <div class="database-explorer-header-actions">
        <label class="database-explorer-global-search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            v-model="globalFilter"
            type="search"
            placeholder="Buscar ambientes, migrations ou tabelas…"
            aria-label="Buscar no banco de dados do projeto"
          >
          <kbd>⌘K</kbd>
        </label>
        <button class="database-explorer-refresh" type="button" :disabled="isRefreshing" @click="refreshActive">
          <ArrowPathIcon aria-hidden="true" :class="{ 'is-spinning': isRefreshing }" />
          {{ isRefreshing ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <nav class="database-explorer-tabs" role="tablist" aria-label="Seções do banco de dados">
      <button
        v-for="tab in sectionTabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeSection === tab.id"
        :class="{ active: activeSection === tab.id }"
        @click="selectSection(tab.id)"
      >
        <component :is="tab.icon" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </nav>

    <div v-if="errorMessage" class="database-explorer-alert" role="alert">{{ errorMessage }}</div>

    <section v-if="activeSection === 'overview'" class="database-section database-overview" role="tabpanel">
      <div class="database-metrics-grid">
        <article class="database-metric-card">
          <span class="database-metric-icon"><ServerStackIcon aria-hidden="true" /></span>
          <div><small>Total de ambientes</small><strong>{{ overview?.total ?? 0 }}</strong><span>{{ reachableEnvironmentsCount }} acessíveis agora</span></div>
        </article>
        <article v-if="isRailsProject" class="database-metric-card">
          <span class="database-metric-icon"><DocumentTextIcon aria-hidden="true" /></span>
          <div><small>Migrations pendentes</small><strong>{{ pendingMigrationsCount }}</strong><span>{{ appliedMigrationsCount }} aplicadas</span></div>
        </article>
        <article class="database-metric-card">
          <span class="database-metric-icon"><ArchiveBoxIcon aria-hidden="true" /></span>
          <div><small>Snapshots</small><strong>{{ snapshots?.total ?? 0 }}</strong><span>de {{ snapshots?.retentionLimit ?? 0 }} guardados</span></div>
        </article>
      </div>

      <section class="database-overview-block">
        <header class="database-block-heading">
          <div><ServerStackIcon aria-hidden="true" /><h4>Ambientes</h4></div>
          <button type="button" @click="selectSection('environments')">Ver todos <ChevronRightIcon aria-hidden="true" /></button>
        </header>
        <div v-if="loading && !overview" class="database-empty-state">Detectando configurações…</div>
        <div v-else-if="overview && !overview.supported" class="database-empty-state"><strong>Nenhuma configuração reconhecida.</strong><span>Procuramos por database.yml, arquivos .env, Prisma e knexfile.</span></div>
        <div v-else class="database-overview-environments">
          <button
            v-for="item in overview?.environments.slice(0, 4) ?? []"
            :key="item.id"
            type="button"
            @click="selectedEnvironmentId = item.id; selectSection('environments')"
          >
            <span class="database-overview-environment-title"><CircleStackIcon aria-hidden="true" /><strong>{{ item.environment }}</strong><StatusBadge :tone="dbReachabilityToneFor(item.reachability)">{{ reachabilityLabels[item.reachability] }}</StatusBadge></span>
            <small>{{ item.driver }}</small>
            <dl><div><dt>Host</dt><dd>{{ item.host ? `${item.host}${item.port ? `:${item.port}` : ''}` : 'Não informado' }}</dd></div><div><dt>Banco</dt><dd>{{ item.database ?? 'Não informado' }}</dd></div></dl>
          </button>
        </div>
      </section>

      <section v-if="isRailsProject" class="database-overview-block">
        <header class="database-block-heading"><div><DocumentTextIcon aria-hidden="true" /><h4>Migrations recentes</h4></div><button type="button" @click="selectSection('migrations')">Ver todas <ChevronRightIcon aria-hidden="true" /></button></header>
        <div v-if="migrationsLoading && !migrations" class="database-empty-state database-empty-state-compact">Consultando migrations…</div>
        <ul v-else class="database-preview-list">
          <li v-for="entry in migrations?.migrations.slice(0, 5) ?? []" :key="entry.version">
            <button type="button" @click="selectMigration(entry); selectSection('migrations')">
              <span class="database-preview-dot" :class="`is-${entry.status}`"></span>
              <code>{{ entry.version }}</code>
              <strong>{{ entry.name }}</strong>
              <StatusBadge :tone="railsMigrationToneFor(entry.status)">{{ migrationStatusLabels[entry.status] }}</StatusBadge>
            </button>
          </li>
        </ul>
        <footer><button type="button" @click="migrationStatusFilter = 'down'; selectSection('migrations')">{{ pendingMigrationsCount }} pendentes <ChevronRightIcon aria-hidden="true" /></button></footer>
      </section>

      <aside class="database-tip"><span>💡</span><div><strong>Dica rápida</strong><p>Mantenha migrations pequenas e revise o schema antes de aplicar mudanças em produção.</p></div><button type="button" @click="selectSection('migrations')">Ir para Migrations <ChevronRightIcon aria-hidden="true" /></button></aside>
    </section>

    <section v-else-if="activeSection === 'environments'" class="database-section" role="tabpanel">
      <div class="database-split-layout database-environments-layout">
        <aside class="database-sidebar-panel">
          <header><div><h4>Ambientes</h4><span>{{ overview?.total ?? 0 }}</span></div></header>
          <div v-if="loading && !overview" class="database-empty-state">Detectando configurações…</div>
          <div v-else class="database-sidebar-list">
            <button
              v-for="item in overview?.environments ?? []"
              :key="item.id"
              type="button"
              :class="{ active: selectedEnvironment?.id === item.id }"
              @click="selectedEnvironmentId = item.id"
            >
              <span class="database-sidebar-item-icon"><ServerStackIcon aria-hidden="true" /></span>
              <span><strong>{{ item.environment }}</strong><small>{{ item.driver }}</small><small>{{ item.host ?? 'Host não informado' }}</small></span>
              <StatusBadge :tone="dbReachabilityToneFor(item.reachability)">{{ reachabilityLabels[item.reachability] }}</StatusBadge>
            </button>
          </div>
          <nav v-if="pages > 1" class="database-pagination" aria-label="Paginação dos ambientes"><button :disabled="page <= 1 || loading" @click="loadDatabase(page - 1)">Anterior</button><span>{{ page }} / {{ pages }}</span><button :disabled="page >= pages || loading" @click="loadDatabase(page + 1)">Próxima</button></nav>
        </aside>

        <article v-if="selectedEnvironment" class="database-detail-panel database-environment-detail">
          <header class="database-detail-title"><div><span class="database-detail-icon"><CircleStackIcon aria-hidden="true" /></span><div><h4>{{ selectedEnvironment.environment }}</h4><p>{{ selectedEnvironment.database ?? 'Banco não informado' }}</p></div><StatusBadge :tone="dbReachabilityToneFor(selectedEnvironment.reachability)">{{ reachabilityLabels[selectedEnvironment.reachability] }}</StatusBadge></div></header>

          <div class="database-environment-detail-grid">
            <section>
              <h5>Detalhes do ambiente</h5>
              <dl class="database-definition-list">
                <div><dt>Driver</dt><dd>{{ selectedEnvironment.driver }}</dd></div>
                <div><dt>Host</dt><dd>{{ selectedEnvironment.host ?? 'Não informado' }}</dd></div>
                <div><dt>Porta</dt><dd>{{ selectedEnvironment.port ?? 'Não informada' }}</dd></div>
                <div><dt>Database</dt><dd>{{ selectedEnvironment.database ?? 'Não informado' }}</dd></div>
                <div><dt>Usuário</dt><dd>{{ selectedEnvironment.username ?? 'Não informado' }}</dd></div>
                <div><dt>Origem</dt><dd>{{ selectedEnvironment.sourceDetail }}</dd></div>
              </dl>
            </section>

            <section class="database-environment-actions-panel">
              <div class="database-health-summary"><span>Saúde da conexão</span><StatusBadge :tone="dbReachabilityToneFor(selectedEnvironment.reachability)">{{ reachabilityLabels[selectedEnvironment.reachability] }}</StatusBadge></div>
              <div v-if="selectedEnvironment.maskedUrl || revealed[selectedEnvironment.id]" class="database-connection-url">
                <header><strong>URL de conexão</strong><button v-if="selectedEnvironment.passwordConfigured" type="button" @click="reveal(selectedEnvironment.id)"><component :is="revealed[selectedEnvironment.id] ? EyeSlashIcon : EyeIcon" aria-hidden="true" />{{ revealed[selectedEnvironment.id] ? 'Ocultar senha' : 'Revelar senha' }}</button></header>
                <code>{{ revealed[selectedEnvironment.id] ?? selectedEnvironment.maskedUrl }}</code>
              </div>
              <div class="database-action-grid">
                <button v-if="revealed[selectedEnvironment.id] || (!selectedEnvironment.passwordConfigured && selectedEnvironment.maskedUrl)" type="button" @click="copy(revealed[selectedEnvironment.id] ?? selectedEnvironment.maskedUrl ?? '', `url-${selectedEnvironment.id}`)"><ClipboardDocumentIcon aria-hidden="true" />{{ copiedKey === `url-${selectedEnvironment.id}` ? 'URL copiada' : 'Copiar URL' }}</button>

                <template v-if="selectedEnvironment.serviceAvailable">
                  <button
                    v-if="selectedEnvironment.reachability === 'unreachable'"
                    class="database-action-primary"
                    type="button"
                    :disabled="pendingAction[selectedEnvironment.id] !== undefined"
                    @click="runAction(selectedEnvironment.id, 'start')"
                  ><PlayIcon aria-hidden="true" />{{ pendingAction[selectedEnvironment.id] === 'start' ? serviceActionLabels.start : 'Iniciar banco local' }}</button>
                  <template v-else>
                    <button
                      type="button"
                      :disabled="pendingAction[selectedEnvironment.id] !== undefined"
                      @click="runAction(selectedEnvironment.id, 'restart')"
                    ><ArrowPathIcon aria-hidden="true" />{{ pendingAction[selectedEnvironment.id] === 'restart' ? serviceActionLabels.restart : 'Reiniciar banco' }}</button>
                    <button
                      class="database-action-danger"
                      type="button"
                      :disabled="pendingAction[selectedEnvironment.id] !== undefined"
                      @click="runAction(selectedEnvironment.id, 'stop')"
                    ><PauseIcon aria-hidden="true" />{{ pendingAction[selectedEnvironment.id] === 'stop' ? serviceActionLabels.stop : 'Pausar banco' }}</button>
                  </template>
                </template>
                <span v-else class="database-service-unavailable-hint">Início, pausa e reinício automáticos não estão disponíveis para este ambiente.</span>
              </div>
              <p v-if="sharedServiceEnvironments.length" class="database-shared-service-hint">
                Este serviço também é usado por: {{ sharedServiceEnvironments.map((item) => item.environment).join(', ') }}. Pausar ou reiniciar afeta esses ambientes também.
              </p>
            </section>
          </div>
        </article>
        <div v-else class="database-detail-panel database-empty-state">Selecione um ambiente para ver os detalhes.</div>
      </div>
    </section>

    <section v-else-if="activeSection === 'snapshots'" class="database-section" role="tabpanel">
      <div class="database-metrics-grid database-metrics-grid-migrations">
        <article class="database-metric-card">
          <span class="database-metric-icon"><ArchiveBoxIcon aria-hidden="true" /></span>
          <div><small>Snapshots</small><strong>{{ snapshots?.total ?? 0 }}</strong><span>de {{ snapshots?.retentionLimit ?? 0 }} guardados</span></div>
        </article>
        <article class="database-metric-card">
          <span class="database-metric-icon"><CircleStackIcon aria-hidden="true" /></span>
          <div><small>Ambiente</small><strong class="database-metric-text">{{ snapshotEnvironmentId || 'Nenhum compatível' }}</strong><span>origem do dump</span></div>
        </article>
        <article class="database-metric-card">
          <span class="database-metric-icon"><CheckCircleIcon aria-hidden="true" /></span>
          <div><small>Último</small><strong class="database-metric-text">{{ snapshots?.snapshots[0] ? snapshotMoment(snapshots.snapshots[0].createdAt) : 'Nenhum ainda' }}</strong><span>criação mais recente</span></div>
        </article>
      </div>

      <div v-if="snapshotsErrorMessage" class="database-explorer-alert" role="alert">{{ snapshotsErrorMessage }}</div>
      <div v-if="snapshotsMessage" class="database-explorer-notice" role="status">{{ snapshotsMessage }}</div>

      <div class="database-toolbar">
        <p class="database-snapshot-hint">
          O dump é gerado com o cliente do próprio banco e fica guardado apenas nesta máquina.
        </p>
        <button
          class="database-action-primary"
          type="button"
          :disabled="!snapshotsSupported || creatingSnapshot"
          @click="createSnapshot"
        >
          <ArchiveBoxIcon aria-hidden="true" />
          {{ creatingSnapshot ? 'Gerando snapshot…' : 'Gerar snapshot' }}
        </button>
      </div>

      <div v-if="!snapshotsSupported && !snapshotsLoading" class="database-empty-state">
        Nenhum ambiente MySQL ou PostgreSQL foi detectado neste projeto — snapshot e restore ficam indisponíveis.
      </div>

      <div v-else-if="snapshotsLoading && !snapshots" class="database-empty-state">Consultando snapshots…</div>

      <div v-else-if="(snapshots?.snapshots.length ?? 0) === 0" class="database-empty-state">
        Nenhum snapshot guardado. Gere um antes de trocar de branch ou rodar uma migration arriscada.
      </div>

      <ul v-else class="database-snapshot-list">
        <li v-for="snapshot in snapshots?.snapshots ?? []" :key="snapshot.id">
          <div class="database-snapshot-info">
            <strong>{{ snapshot.label }}</strong>
            <small>{{ snapshotMoment(snapshot.createdAt) }} · {{ snapshot.database }} · {{ snapshot.driver }}</small>
          </div>
          <span class="database-snapshot-size">{{ formatBytes(snapshot.sizeBytes) }}</span>

          <div v-if="pendingRestoreId === snapshot.id" class="database-snapshot-confirm">
            <span>Restaurar sobrescreve o banco atual.</span>
            <button type="button" :disabled="restoringSnapshotId === snapshot.id" @click="confirmRestore(snapshot.id)">
              {{ restoringSnapshotId === snapshot.id ? 'Restaurando…' : 'Confirmar' }}
            </button>
            <button type="button" :disabled="restoringSnapshotId === snapshot.id" @click="cancelRestore">Cancelar</button>
          </div>
          <button v-else type="button" @click="requestRestore(snapshot.id)">
            <ArrowUturnLeftIcon aria-hidden="true" />
            Restaurar
          </button>
        </li>
      </ul>
    </section>

    <section v-else-if="activeSection === 'migrations'" class="database-section" role="tabpanel">
      <div class="database-metrics-grid database-metrics-grid-migrations">
        <article class="database-metric-card"><span class="database-metric-icon"><DocumentTextIcon aria-hidden="true" /></span><div><small>Total</small><strong>{{ migrations?.migrations.length ?? 0 }}</strong><span>migrations</span></div></article>
        <article class="database-metric-card database-metric-card-warning"><span class="database-metric-icon"><ArrowPathIcon aria-hidden="true" /></span><div><small>Pendentes</small><strong>{{ pendingMigrationsCount }}</strong><span>aguardando</span></div></article>
        <article class="database-metric-card"><span class="database-metric-icon"><CheckCircleIcon aria-hidden="true" /></span><div><small>Aplicadas</small><strong>{{ appliedMigrationsCount }}</strong><span>concluídas</span></div></article>
        <article class="database-metric-card"><span class="database-metric-icon"><CircleStackIcon aria-hidden="true" /></span><div><small>Banco</small><strong class="database-metric-text">{{ migrations?.database ?? 'Não informado' }}</strong><span>status atual</span></div></article>
      </div>

      <div class="database-toolbar">
        <div class="database-segmented-control" aria-label="Filtrar migrations por status"><button type="button" :class="{ active: migrationStatusFilter === 'all' }" @click="migrationStatusFilter = 'all'">Todas <span>{{ migrations?.migrations.length ?? 0 }}</span></button><button type="button" :class="{ active: migrationStatusFilter === 'down' }" @click="migrationStatusFilter = 'down'">Pendentes <span>{{ pendingMigrationsCount }}</span></button><button type="button" :class="{ active: migrationStatusFilter === 'up' }" @click="migrationStatusFilter = 'up'">Aplicadas <span>{{ appliedMigrationsCount }}</span></button></div>
        <label class="database-local-search"><MagnifyingGlassIcon aria-hidden="true" /><input v-model="migrationFilter" type="search" placeholder="Buscar por versão ou nome…"></label>
      </div>

      <div v-if="migrationsErrorMessage" class="database-explorer-alert" role="alert">{{ migrationsErrorMessage }}</div>
      <div v-else-if="migrationsLoading && !migrations" class="database-empty-state">Consultando migrations…</div>
      <div v-else-if="migrations && !migrations.supported" class="database-empty-state"><strong>Status de migrations indisponível.</strong><span>Não encontramos bin/rails ou o comando falhou.</span></div>
      <div v-else class="database-table-detail-layout">
        <div class="database-table-shell">
          <table class="database-data-table database-migrations-table">
            <thead><tr><th>Versão</th><th>Nome</th><th>Status</th><th></th></tr></thead>
            <tbody>
              <tr v-for="entry in filteredMigrations" :key="entry.version" :class="{ active: selectedMigrationEntry?.version === entry.version }">
                <td><button type="button" @click="selectMigration(entry)"><code>{{ entry.version }}</code></button></td>
                <td><button type="button" @click="selectMigration(entry)">{{ entry.name }}</button></td>
                <td><StatusBadge :tone="railsMigrationToneFor(entry.status)">{{ migrationStatusLabels[entry.status] }}</StatusBadge></td>
                <td><button class="database-row-action" type="button" aria-label="Ver detalhes" @click="selectMigration(entry)"><ChevronRightIcon aria-hidden="true" /></button></td>
              </tr>
            </tbody>
          </table>
          <p v-if="filteredMigrations.length === 0" class="database-empty-state database-empty-state-compact">Nenhuma migration corresponde aos filtros.</p>
        </div>

        <aside class="database-inspector-panel">
          <header><div><small>Detalhes da migration</small><h4>{{ selectedMigrationEntry?.name ?? 'Selecione uma migration' }}</h4></div></header>
          <div v-if="migrationDetailErrorMessage" class="database-explorer-alert" role="alert">{{ migrationDetailErrorMessage }}</div>
          <div v-else-if="migrationDetailLoading" class="database-empty-state database-empty-state-compact">Carregando arquivo…</div>
          <template v-else-if="selectedMigrationEntry">
            <StatusBadge :tone="railsMigrationToneFor(selectedMigrationEntry.status)">{{ migrationStatusLabels[selectedMigrationEntry.status] }}</StatusBadge>
            <dl class="database-inspector-list">
              <div><dt>Versão</dt><dd><code>{{ selectedMigrationEntry.version }}</code><button type="button" @click="copy(selectedMigrationEntry.version, 'migration-version')"><ClipboardDocumentIcon aria-hidden="true" />{{ copiedKey === 'migration-version' ? 'Copiada' : 'Copiar' }}</button></dd></div>
              <div><dt>Arquivo</dt><dd><code>{{ migrationDetail?.filePath ?? 'Arquivo não localizado' }}</code></dd></div>
              <div><dt>Status</dt><dd>{{ migrationStatusLabels[selectedMigrationEntry.status] }}</dd></div>
            </dl>
            <section class="database-source-preview">
              <header><strong>Código da migration</strong><button v-if="migrationDetail?.source" type="button" @click="copy(migrationDetail.source, 'migration-source')"><ClipboardDocumentIcon aria-hidden="true" />{{ copiedKey === 'migration-source' ? 'Código copiado' : 'Copiar código' }}</button></header>
              <pre v-if="migrationDetail?.source"><code>{{ migrationDetail.source }}</code></pre>
              <p v-else>O status existe no banco, mas o arquivo da migration não foi encontrado no projeto.</p>
            </section>
          </template>
        </aside>
      </div>

      <section class="database-mutation-panel">
        <header><div><strong>Operações Rails</strong><span>Cada comando pede confirmação antes de executar.</span></div></header>
        <div class="database-mutation-actions"><button type="button" :disabled="mutationRunning !== ''" @click="runMigrationMutation('migrate')">{{ mutationRunning === 'migrate' ? 'Rodando migrate…' : 'Rodar migrate' }}</button><button type="button" :disabled="mutationRunning !== ''" @click="runMigrationMutation('rollback')">{{ mutationRunning === 'rollback' ? 'Desfazendo…' : 'Rollback (1 passo)' }}</button><button type="button" :disabled="mutationRunning !== ''" @click="runMigrationMutation('seed')">{{ mutationRunning === 'seed' ? 'Rodando seed…' : 'Rodar seed' }}</button><button type="button" :disabled="mutationRunning !== ''" @click="runMigrationMutation('prepare')">{{ mutationRunning === 'prepare' ? 'Preparando…' : 'db:prepare' }}</button></div>
        <p v-if="mutationErrorMessage" class="database-explorer-alert" role="alert">{{ mutationErrorMessage }}</p><p v-else-if="mutationMessage" class="database-success-message">{{ mutationMessage }}</p><pre v-if="mutationOutput" class="database-command-output">{{ mutationOutput }}</pre>
      </section>
    </section>

    <section v-else-if="activeSection === 'models'" class="database-section" role="tabpanel">
      <div class="database-metrics-grid">
        <article class="database-metric-card"><span class="database-metric-icon"><TableCellsIcon aria-hidden="true" /></span><div><small>Total de tabelas</small><strong>{{ models?.tables.length ?? 0 }}</strong><span>em {{ models?.schemaPath ?? 'schema.rb' }}</span></div></article>
        <article class="database-metric-card"><span class="database-metric-icon"><CodeBracketSquareIcon aria-hidden="true" /></span><div><small>Total de colunas</small><strong>{{ totalColumns }}</strong><span>campos declarados</span></div></article>
        <article class="database-metric-card"><span class="database-metric-icon"><LinkIcon aria-hidden="true" /></span><div><small>Relações</small><strong>{{ totalRelations }}</strong><span>foreign keys</span></div></article>
        <article class="database-metric-card"><span class="database-metric-icon"><FunnelIcon aria-hidden="true" /></span><div><small>Índices</small><strong>{{ totalIndexes }}</strong><span>declarados</span></div></article>
      </div>

      <div v-if="modelsErrorMessage" class="database-explorer-alert" role="alert">{{ modelsErrorMessage }}</div>
      <div v-else-if="modelsLoading && !models" class="database-empty-state">Lendo db/schema.rb…</div>
      <div v-else-if="models && !models.supported" class="database-empty-state"><strong>Schema Rails indisponível.</strong><span>Não encontramos um arquivo db/schema.rb neste projeto.</span></div>
      <div v-else class="database-split-layout database-models-layout">
        <aside class="database-sidebar-panel">
          <header><div><h4>Tabelas</h4><span>{{ filteredTables.length }}</span></div><label class="database-sidebar-search"><MagnifyingGlassIcon aria-hidden="true" /><input v-model="modelFilter" type="search" placeholder="Buscar tabela ou coluna…"></label></header>
          <div class="database-sidebar-list database-table-list">
            <button v-for="table in filteredTables" :key="table.name" type="button" :class="{ active: selectedTable?.name === table.name }" @click="selectedTableName = table.name">
              <span class="database-sidebar-item-icon"><TableCellsIcon aria-hidden="true" /></span><span><strong>{{ table.name }}</strong><small>{{ table.columns.length }} colunas</small></span><small>{{ table.indexes.length }} índices</small>
            </button>
          </div>
        </aside>

        <article v-if="selectedTable" class="database-detail-panel database-model-detail">
          <header class="database-detail-title"><div><span class="database-detail-icon"><TableCellsIcon aria-hidden="true" /></span><div><h4>{{ selectedTable.name }}</h4><p>{{ selectedTable.columns.length }} colunas · {{ selectedTable.indexes.length }} índices · {{ selectedTable.foreignKeys.length }} relações</p></div></div><button type="button" @click="copy(selectedTable.name, 'table-name')"><ClipboardDocumentIcon aria-hidden="true" />{{ copiedKey === 'table-name' ? 'Nome copiado' : 'Copiar nome' }}</button></header>

          <section class="database-model-section">
            <header><h5>Colunas ({{ selectedTable.columns.length }})</h5></header>
            <div class="database-table-shell">
              <table class="database-data-table database-columns-table"><thead><tr><th>Coluna</th><th>Tipo</th><th>Nulo</th><th>Padrão</th><th>Índice</th></tr></thead><tbody><tr v-for="column in selectedTable.columns" :key="column.name"><td><code>{{ column.name }}</code></td><td>{{ columnTypeLabel(selectedTable, column.name) }}</td><td>{{ column.nullable ? 'Sim' : 'Não' }}</td><td><code>{{ column.default ?? '—' }}</code></td><td><span v-if="column.primaryKey" class="database-key-badge">PK</span><span v-else-if="selectedTable.indexes.some((index) => index.columns.includes(column.name))" class="database-index-badge">IX</span><span v-else>—</span></td></tr></tbody></table>
            </div>
          </section>

          <section class="database-model-section database-model-subgrid">
            <div><header><h5>Índices ({{ selectedTable.indexes.length }})</h5></header><ul class="database-schema-list"><li v-for="(index, indexNumber) in selectedTable.indexes" :key="index.name ?? indexNumber"><FunnelIcon aria-hidden="true" /><span><strong>{{ index.name ?? `Índice ${indexNumber + 1}` }}</strong><code>{{ index.columns.join(', ') }}</code></span><small>{{ index.unique ? 'Único' : 'Comum' }}</small></li><li v-if="selectedTable.indexes.length === 0" class="database-schema-empty">Nenhum índice declarado.</li></ul></div>
            <div><header><h5>Relacionamentos ({{ selectedTable.foreignKeys.length }})</h5></header><ul class="database-schema-list"><li v-for="relation in selectedTable.foreignKeys" :key="`${relation.column}-${relation.toTable}`"><LinkIcon aria-hidden="true" /><span><strong>{{ relation.column }} → {{ relation.toTable }}</strong><code>{{ relation.fromTable }}.{{ relation.column }}</code></span><small>FK</small></li><li v-if="selectedTable.foreignKeys.length === 0" class="database-schema-empty">Nenhuma foreign key declarada.</li></ul></div>
          </section>
        </article>
      </div>
    </section>
  </section>
</template>
