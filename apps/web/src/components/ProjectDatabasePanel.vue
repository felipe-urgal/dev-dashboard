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
  CommandLineIcon,
  CubeIcon,
  DocumentTextIcon,
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  MapIcon,
  PlayIcon,
  ServerStackIcon,
  TableCellsIcon,
} from '@heroicons/vue/24/outline';

import type {
  BundlerOutdatedGem,
  Project,
  ProjectDatabaseEnvironment,
  RailsMigrationEntry,
  RailsRouteEntry,
  RailsSchemaTable,
} from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectDatabaseOverview } from '../composables/useProjectDatabaseOverview';
import { useProjectDatabaseSnapshots } from '../composables/useProjectDatabaseSnapshots';
import { useRailsBundler } from '../composables/useRailsBundler';
import { useRailsMigrations } from '../composables/useRailsMigrations';
import { useRailsModels } from '../composables/useRailsModels';
import { useRailsRoutes, routeKey } from '../composables/useRailsRoutes';
import { dbReachabilityToneFor, railsMigrationToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

type DatabaseSection = 'overview' | 'environments' | 'snapshots' | 'migrations' | 'models' | 'routes' | 'dependencies';
type MigrationStatusFilter = 'all' | 'up' | 'down';
type RouteVerbFilter = 'all' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const isRailsProject = computed(() => props.project.type === 'rails');

const {
  overview,
  loading,
  errorMessage,
  revealed,
  page,
  starting,
  selectedEnvironmentId,
  loadDatabase,
  reveal,
  start,
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
  routes,
  routesLoading,
  routesErrorMessage,
  selectedRouteKey,
  loadRoutes,
  selectRoute,
} = useRailsRoutes(() => props.project, isRailsProject);

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

const {
  bundler,
  bundlerLoading,
  bundlerErrorMessage,
  selectedGemName,
  loadBundler,
} = useRailsBundler(() => props.project, isRailsProject);

const activeSection = ref<DatabaseSection>('overview');
const globalFilter = ref('');
const migrationFilter = ref('');
const migrationStatusFilter = ref<MigrationStatusFilter>('all');
const modelFilter = ref('');
const routeFilter = ref('');
const routeVerbFilter = ref<RouteVerbFilter>('all');
const outdatedFilter = ref('');

const copiedKey = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

useAutoDismiss(errorMessage, '');
useAutoDismiss(migrationsErrorMessage, '');
useAutoDismiss(migrationDetailErrorMessage, '');
useAutoDismiss(modelsErrorMessage, '');
useAutoDismiss(routesErrorMessage, '');
useAutoDismiss(mutationMessage, '');
useAutoDismiss(mutationErrorMessage, '');
useAutoDismiss(bundlerErrorMessage, '');
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

const sectionTabs = computed(() => [
  { id: 'overview' as const, label: 'Visão geral', icon: CircleStackIcon },
  { id: 'environments' as const, label: 'Ambientes', icon: ServerStackIcon },
  { id: 'snapshots' as const, label: 'Snapshots', icon: ArchiveBoxIcon },
  ...(isRailsProject.value ? [
    { id: 'migrations' as const, label: 'Migrations', icon: DocumentTextIcon },
    { id: 'models' as const, label: 'Modelos', icon: TableCellsIcon },
    { id: 'routes' as const, label: 'Rotas', icon: MapIcon },
    { id: 'dependencies' as const, label: 'Dependências', icon: CubeIcon },
  ] : []),
]);

const sectionTitle = computed(() => ({
  overview: 'Banco de dados do projeto',
  environments: 'Ambientes',
  snapshots: 'Snapshots',
  migrations: 'Migrations',
  models: 'Modelos',
  routes: 'Rotas',
  dependencies: 'Dependências',
})[activeSection.value]);

const sectionDescription = computed(() => ({
  overview: 'Visão consolidada de ambientes, migrations, modelos, rotas e dependências.',
  environments: 'Gerencie conexões, credenciais e disponibilidade dos bancos detectados.',
  snapshots: 'Guarde o estado do banco antes de trocar de branch e restaure quando precisar.',
  migrations: 'Acompanhe o status e consulte o código-fonte de cada migration.',
  models: 'Explore as tabelas do schema, suas colunas, índices e relacionamentos.',
  routes: 'Pesquise endpoints Rails e consulte controller, action e helper.',
  dependencies: 'Verifique o Bundler e as gems que possuem atualizações disponíveis.',
})[activeSection.value]);

const isRefreshing = computed(() => loading.value || migrationsLoading.value || modelsLoading.value || routesLoading.value || bundlerLoading.value);

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

const filteredRoutes = computed(() => {
  const query = activeQuery(routeFilter.value);
  return (routes.value?.routes ?? []).filter((route) => {
    const verbMatches = routeVerbFilter.value === 'all' || route.verb === routeVerbFilter.value;
    const queryMatches = !query
      || route.path.toLowerCase().includes(query)
      || route.controllerAction.toLowerCase().includes(query)
      || (route.name ?? '').toLowerCase().includes(query)
      || route.verb.toLowerCase().includes(query);
    return verbMatches && queryMatches;
  });
});

const filteredOutdatedGems = computed(() => {
  const query = activeQuery(outdatedFilter.value);
  if (!query) return bundler.value?.outdated ?? [];
  return (bundler.value?.outdated ?? []).filter((gem) => gem.name.toLowerCase().includes(query));
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

const selectedRoute = computed<RailsRouteEntry | null>(() => {
  const list = routes.value?.routes ?? [];
  const index = list.findIndex((route, routeIndex) => routeKey(route, routeIndex) === selectedRouteKey.value);
  return index >= 0 ? list[index] ?? null : list[0] ?? null;
});

const selectedGem = computed<BundlerOutdatedGem | null>(() =>
  bundler.value?.outdated.find((gem) => gem.name === selectedGemName.value)
  ?? bundler.value?.outdated[0]
  ?? null,
);

const routeVerbCounts = computed(() => {
  const counts: Record<string, number> = { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0 };
  for (const route of routes.value?.routes ?? []) {
    if (route.verb in counts) counts[route.verb] = (counts[route.verb] ?? 0) + 1;
  }
  return counts;
});

const majorGemUpdates = computed(() => (bundler.value?.outdated ?? []).filter((gem) => {
  const installed = Number(gem.installed.match(/^\d+/)?.[0] ?? Number.NaN);
  const newest = Number(gem.newest.match(/^\d+/)?.[0] ?? Number.NaN);
  return Number.isFinite(installed) && Number.isFinite(newest) && newest > installed;
}).length);

function routeControllerAction(route: RailsRouteEntry | null): { controller: string; action: string } {
  const [controller = '—', action = '—'] = (route?.controllerAction ?? '').split('#');
  return { controller, action };
}

async function refreshAll(): Promise<void> {
  await Promise.all([
    loadDatabase(1),
    loadMigrations(),
    loadModels(),
    loadRoutes(),
    loadBundler(),
  ]);
}

async function refreshActive(): Promise<void> {
  if (activeSection.value === 'overview') return refreshAll();
  if (activeSection.value === 'environments') return loadDatabase();
  if (activeSection.value === 'snapshots') return loadSnapshots();
  if (activeSection.value === 'migrations') return loadMigrations();
  if (activeSection.value === 'models') return loadModels();
  if (activeSection.value === 'routes') return loadRoutes();
  return loadBundler();
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

function clientUrl(id: string, driver: string): string {
  return `dev-dashboard://database/open?projectId=${encodeURIComponent(props.project.id)}&environmentId=${encodeURIComponent(id)}&driver=${encodeURIComponent(driver)}`;
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
  routeFilter.value = '';
  outdatedFilter.value = '';
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
            placeholder="Buscar ambientes, migrations, tabelas ou rotas…"
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
        <article class="database-metric-card">
          <span class="database-metric-icon"><DocumentTextIcon aria-hidden="true" /></span>
          <div><small>Migrations pendentes</small><strong>{{ pendingMigrationsCount }}</strong><span>{{ appliedMigrationsCount }} aplicadas</span></div>
        </article>
        <article class="database-metric-card">
          <span class="database-metric-icon"><MapIcon aria-hidden="true" /></span>
          <div><small>Rotas Rails</small><strong>{{ routes?.routes.length ?? 0 }}</strong><span>endpoints reconhecidos</span></div>
        </article>
        <article class="database-metric-card database-metric-card-danger">
          <span class="database-metric-icon"><CubeIcon aria-hidden="true" /></span>
          <div><small>Gems desatualizadas</small><strong>{{ bundler?.outdated.length ?? 0 }}</strong><span>{{ majorGemUpdates }} atualizações maiores</span></div>
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

      <div v-if="isRailsProject" class="database-overview-columns">
        <section class="database-overview-block">
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

        <section class="database-overview-block">
          <header class="database-block-heading"><div><MapIcon aria-hidden="true" /><h4>Rotas da aplicação</h4></div><button type="button" @click="selectSection('routes')">Ver todas <ChevronRightIcon aria-hidden="true" /></button></header>
          <div v-if="routesLoading && !routes" class="database-empty-state database-empty-state-compact">Consultando rotas…</div>
          <div v-else class="database-preview-routes">
            <div class="database-preview-route-head"><span>Verbo</span><span>Rota</span><span>Ação</span></div>
            <button v-for="(route, index) in routes?.routes.slice(0, 5) ?? []" :key="routeKey(route, index)" type="button" @click="selectRoute(route, index); selectSection('routes')">
              <span class="route-verb" :class="`route-verb-${route.verb.toLowerCase()}`">{{ route.verb }}</span><code>{{ route.path }}</code><span>{{ route.controllerAction }}</span>
            </button>
          </div>
          <footer><button type="button" @click="selectSection('routes')">Total de {{ routes?.routes.length ?? 0 }} rotas <ChevronRightIcon aria-hidden="true" /></button></footer>
        </section>

        <section class="database-overview-block">
          <header class="database-block-heading"><div><CubeIcon aria-hidden="true" /><h4>Dependências / Saúde</h4></div><button type="button" @click="selectSection('dependencies')">Ver detalhes <ChevronRightIcon aria-hidden="true" /></button></header>
          <div class="database-health-card" :class="bundler?.check?.satisfied ? 'is-success' : 'is-warning'">
            <CheckCircleIcon aria-hidden="true" />
            <div><strong>Bundle check</strong><span>{{ bundler?.check?.satisfied ? 'Tudo certo com suas dependências.' : 'Existem dependências pendentes.' }}</span></div>
          </div>
          <h5>Gems desatualizadas ({{ bundler?.outdated.length ?? 0 }})</h5>
          <ul class="database-gem-preview">
            <li v-for="gem in bundler?.outdated.slice(0, 3) ?? []" :key="gem.name"><code>{{ gem.name }}</code><span>{{ gem.installed }} → {{ gem.newest }}</span></li>
          </ul>
          <footer><button type="button" @click="selectSection('dependencies')">Ver todas <ChevronRightIcon aria-hidden="true" /></button></footer>
        </section>
      </div>

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
                <a :href="clientUrl(selectedEnvironment.id, selectedEnvironment.driver)"><CommandLineIcon aria-hidden="true" />Abrir cliente</a>
                <button v-if="selectedEnvironment.reachability === 'unreachable'" class="database-action-primary" type="button" :disabled="starting[selectedEnvironment.id] || !selectedEnvironment.startAvailable" @click="start(selectedEnvironment.id)"><PlayIcon aria-hidden="true" />{{ starting[selectedEnvironment.id] ? 'Iniciando…' : selectedEnvironment.startAvailable ? 'Iniciar banco local' : 'Início não configurado' }}</button>
              </div>
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

    <section v-else-if="activeSection === 'routes'" class="database-section" role="tabpanel">
      <div class="database-metrics-grid database-route-metrics">
        <article class="database-metric-card"><span class="database-metric-icon"><MapIcon aria-hidden="true" /></span><div><small>Total de rotas</small><strong>{{ routes?.routes.length ?? 0 }}</strong><span>todas as rotas</span></div></article>
        <article v-for="verb in ['GET', 'POST', 'PATCH', 'DELETE']" :key="verb" class="database-metric-card"><span class="route-verb" :class="`route-verb-${verb.toLowerCase()}`">{{ verb }}</span><div><small>{{ verb }}</small><strong>{{ routeVerbCounts[verb] ?? 0 }}</strong><span>endpoints</span></div></article>
      </div>

      <div class="database-toolbar"><label class="database-local-search"><MagnifyingGlassIcon aria-hidden="true" /><input v-model="routeFilter" type="search" placeholder="Buscar rota, controller ou helper…"></label><div class="database-segmented-control database-route-filter"><button v-for="verb in ['all', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const" :key="verb" type="button" :class="{ active: routeVerbFilter === verb }" @click="routeVerbFilter = verb">{{ verb === 'all' ? 'Todos' : verb }}</button></div><span class="database-toolbar-count">{{ filteredRoutes.length }} rotas</span></div>

      <div v-if="routesErrorMessage" class="database-explorer-alert" role="alert">{{ routesErrorMessage }}</div>
      <div v-else-if="routesLoading && !routes" class="database-empty-state">Consultando rotas…</div>
      <div v-else-if="routes && !routes.supported" class="database-empty-state"><strong>Rotas indisponíveis.</strong><span>Não encontramos bin/rails ou o comando falhou.</span></div>
      <div v-else class="database-table-detail-layout database-routes-layout">
        <div class="database-table-shell"><table class="database-data-table database-routes-table"><thead><tr><th>Método</th><th>Rota</th><th>Controller#Action</th><th>Nome</th><th></th></tr></thead><tbody><tr v-for="(route, index) in filteredRoutes" :key="routeKey(route, index)" :class="{ active: selectedRoute === route }"><td><span class="route-verb" :class="`route-verb-${route.verb.toLowerCase()}`">{{ route.verb }}</span></td><td><button type="button" @click="selectRoute(route, index)"><code>{{ route.path }}</code></button></td><td><button type="button" @click="selectRoute(route, index)">{{ route.controllerAction }}</button></td><td><code>{{ route.name ?? '—' }}</code></td><td><button class="database-row-action" type="button" @click="selectRoute(route, index)"><ChevronRightIcon aria-hidden="true" /></button></td></tr></tbody></table><p v-if="filteredRoutes.length === 0" class="database-empty-state database-empty-state-compact">Nenhuma rota corresponde aos filtros.</p></div>

        <aside class="database-inspector-panel">
          <header><div><small>Detalhes da rota</small><h4>{{ selectedRoute?.controllerAction ?? 'Selecione uma rota' }}</h4></div></header>
          <template v-if="selectedRoute">
            <span class="route-verb" :class="`route-verb-${selectedRoute.verb.toLowerCase()}`">{{ selectedRoute.verb }}</span>
            <dl class="database-inspector-list"><div><dt>Rota completa</dt><dd><code>{{ selectedRoute.path }}</code></dd></div><div><dt>Controller</dt><dd><code>{{ routeControllerAction(selectedRoute).controller }}</code></dd></div><div><dt>Action</dt><dd><code>{{ routeControllerAction(selectedRoute).action }}</code></dd></div><div><dt>Helper</dt><dd><code>{{ selectedRoute.name ?? 'Não informado' }}</code></dd></div></dl>
            <div class="database-inspector-actions"><button type="button" @click="copy(selectedRoute.path, 'route-path')"><ClipboardDocumentIcon aria-hidden="true" />{{ copiedKey === 'route-path' ? 'Rota copiada' : 'Copiar rota' }}</button><button type="button" @click="copy(selectedRoute.controllerAction, 'route-action')"><CodeBracketSquareIcon aria-hidden="true" />{{ copiedKey === 'route-action' ? 'Ação copiada' : 'Copiar action' }}</button></div>
          </template>
        </aside>
      </div>
    </section>

    <section v-else class="database-section" role="tabpanel">
      <div class="database-metrics-grid">
        <article class="database-metric-card" :class="bundler?.check?.satisfied ? 'database-metric-card-success' : 'database-metric-card-warning'"><span class="database-metric-icon"><CheckCircleIcon aria-hidden="true" /></span><div><small>Bundle check</small><strong class="database-metric-text">{{ bundler?.check?.satisfied ? 'Tudo certo' : 'Pendente' }}</strong><span>estado das dependências</span></div></article>
        <article class="database-metric-card database-metric-card-danger"><span class="database-metric-icon"><CubeIcon aria-hidden="true" /></span><div><small>Gems desatualizadas</small><strong>{{ bundler?.outdated.length ?? 0 }}</strong><span>atualizações disponíveis</span></div></article>
        <article class="database-metric-card"><span class="database-metric-icon"><DocumentTextIcon aria-hidden="true" /></span><div><small>Com requisito</small><strong>{{ bundler?.outdated.filter((gem) => gem.requested).length ?? 0 }}</strong><span>restrições no Gemfile</span></div></article>
        <article class="database-metric-card database-metric-card-warning"><span class="database-metric-icon"><ArrowPathIcon aria-hidden="true" /></span><div><small>Atualização maior</small><strong>{{ majorGemUpdates }}</strong><span>exigem mais atenção</span></div></article>
      </div>

      <div v-if="bundlerErrorMessage" class="database-explorer-alert" role="alert">{{ bundlerErrorMessage }}</div>
      <div v-else-if="bundlerLoading && !bundler" class="database-empty-state">Consultando o Bundler…</div>
      <div v-else-if="bundler && !bundler.supported" class="database-empty-state"><strong>Diagnóstico Bundler indisponível.</strong><span>Não encontramos um Gemfile neste projeto.</span></div>
      <div v-else class="database-split-layout database-dependencies-layout">
        <aside class="database-sidebar-panel">
          <header><div><h4>Gems desatualizadas</h4><span>{{ filteredOutdatedGems.length }}</span></div><label class="database-sidebar-search"><MagnifyingGlassIcon aria-hidden="true" /><input v-model="outdatedFilter" type="search" placeholder="Buscar gem…"></label></header>
          <div class="database-sidebar-list database-gem-list"><button v-for="gem in filteredOutdatedGems" :key="gem.name" type="button" :class="{ active: selectedGem?.name === gem.name }" @click="selectedGemName = gem.name"><span class="database-sidebar-item-icon"><CubeIcon aria-hidden="true" /></span><span><strong>{{ gem.name }}</strong><small>{{ gem.installed }} → {{ gem.newest }}</small></span><ChevronRightIcon aria-hidden="true" /></button></div>
        </aside>

        <article v-if="selectedGem" class="database-detail-panel database-gem-detail">
          <header class="database-detail-title"><div><span class="database-detail-icon"><CubeIcon aria-hidden="true" /></span><div><h4>{{ selectedGem.name }}</h4><p>Atualização disponível</p></div><StatusBadge tone="warning">Desatualizada</StatusBadge></div></header>
          <dl class="database-definition-list"><div><dt>Instalada</dt><dd>{{ selectedGem.installed }}</dd></div><div><dt>Mais nova</dt><dd>{{ selectedGem.newest }}</dd></div><div><dt>Requisitada</dt><dd>{{ selectedGem.requested ?? 'Sem restrição informada' }}</dd></div><div><dt>Comando</dt><dd><code>bundle update {{ selectedGem.name }}</code></dd></div></dl>
          <section class="database-dependency-note"><h5>Antes de atualizar</h5><p>Revise o changelog da gem, execute a suíte de testes e valide a alteração em um ambiente que não seja produção.</p></section>
          <div class="database-inspector-actions"><button type="button" @click="copy(`bundle update ${selectedGem.name}`, 'gem-command')"><ClipboardDocumentIcon aria-hidden="true" />{{ copiedKey === 'gem-command' ? 'Comando copiado' : 'Copiar comando' }}</button><button type="button" @click="copy(selectedGem.name, 'gem-name')"><DocumentTextIcon aria-hidden="true" />{{ copiedKey === 'gem-name' ? 'Nome copiado' : 'Copiar nome' }}</button></div>
        </article>
        <div v-else class="database-detail-panel database-empty-state">Nenhuma gem desatualizada encontrada.</div>
      </div>
    </section>
  </section>
</template>
