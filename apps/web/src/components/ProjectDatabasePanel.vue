<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';
import { routeLocationKey } from 'vue-router';
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
  XMarkIcon,
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
import { highlightGitDiffCode } from '../utils/git-syntax-highlight';
import {
  dbReachabilityToneFor,
  railsMigrationToneFor,
} from '../utils/status-tones';
import RailsGeneratorForm from './RailsGeneratorForm.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();
const route = inject(routeLocationKey, undefined);

type DatabaseSection =
  | 'overview'
  | 'environments'
  | 'snapshots'
  | 'migrations'
  | 'models'
  | 'operations';
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
  selectedDatabase: selectedMigrationsDatabase,
  mutationRunning,
  mutationMessage,
  mutationErrorMessage,
  mutationOutput,
  mutationLabels,
  loadMigrations,
  selectMigration,
  selectDatabase: selectMigrationsDatabase,
  runMigrationMutation,
} = useRailsMigrations(() => props.project, isRailsProject);

const {
  models,
  modelsLoading,
  modelsErrorMessage,
  selectedTableName,
  selectedDatabase: selectedModelsDatabase,
  loadModels,
  selectDatabase: selectModelsDatabase,
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
const migrationModalOpen = ref(false);

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

const pages = computed(() =>
  Math.max(
    1,
    Math.ceil((overview.value?.total ?? 0) / (overview.value?.pageSize ?? 20)),
  ),
);
const pendingMigrationsCount = computed(
  () =>
    migrations.value?.migrations.filter((item) => item.status === 'down')
      .length ?? 0,
);
const appliedMigrationsCount = computed(
  () =>
    migrations.value?.migrations.filter((item) => item.status === 'up')
      .length ?? 0,
);
const reachableEnvironmentsCount = computed(
  () =>
    overview.value?.environments.filter(
      (item) => item.reachability === 'reachable',
    ).length ?? 0,
);
const totalColumns = computed(
  () =>
    models.value?.tables.reduce(
      (total, table) => total + table.columns.length,
      0,
    ) ?? 0,
);
const totalIndexes = computed(
  () =>
    models.value?.tables.reduce(
      (total, table) => total + table.indexes.length,
      0,
    ) ?? 0,
);
const totalRelations = computed(
  () =>
    models.value?.tables.reduce(
      (total, table) => total + table.foreignKeys.length,
      0,
    ) ?? 0,
);

const reachabilityLabels = {
  reachable: 'Acessível',
  unreachable: 'Indisponível',
  unknown: 'Não verificado',
} as const;
const migrationStatusLabels = { up: 'Aplicada', down: 'Pendente' } as const;
const serviceActionLabels: Record<DatabaseServiceAction, string> = {
  start: 'Iniciando…',
  stop: 'Pausando…',
  restart: 'Reiniciando…',
};

const sectionTabs = computed(() => [
  { id: 'overview' as const, label: 'Visão geral', icon: CircleStackIcon },
  { id: 'environments' as const, label: 'Ambientes', icon: ServerStackIcon },
  { id: 'snapshots' as const, label: 'Snapshots', icon: ArchiveBoxIcon },
  ...(isRailsProject.value
    ? [
        {
          id: 'migrations' as const,
          label: 'Migrations',
          icon: DocumentTextIcon,
        },
        { id: 'models' as const, label: 'Modelos', icon: TableCellsIcon },
        {
          id: 'operations' as const,
          label: 'Operações',
          icon: CommandLineIcon,
        },
      ]
    : []),
]);

const sectionTitle = computed(
  () =>
    ({
      overview: 'Banco de dados do projeto',
      environments: 'Ambientes',
      snapshots: 'Snapshots',
      migrations: 'Migrations',
      models: 'Modelos',
      operations: 'Operações',
    })[activeSection.value],
);

const sectionDescription = computed(
  () =>
    ({
      overview: 'Visão consolidada de ambientes, migrations e modelos.',
      environments:
        'Gerencie conexões, credenciais e disponibilidade dos bancos detectados.',
      snapshots:
        'Guarde o estado do banco antes de trocar de branch e restaure quando precisar.',
      migrations:
        'Acompanhe o status e consulte o código-fonte de cada migration.',
      models:
        'Explore as tabelas do schema, suas colunas, índices e relacionamentos.',
      operations:
        'Rode comandos de banco e gere model ou migration a partir dos campos informados.',
    })[activeSection.value],
);

const isRefreshing = computed(
  () => loading.value || migrationsLoading.value || modelsLoading.value,
);

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
    const statusMatches =
      migrationStatusFilter.value === 'all' ||
      entry.status === migrationStatusFilter.value;
    const queryMatches =
      !query ||
      entry.version.toLowerCase().includes(query) ||
      entry.name.toLowerCase().includes(query);
    return statusMatches && queryMatches;
  });
});

const filteredTables = computed(() => {
  const query = activeQuery(modelFilter.value);
  if (!query) return models.value?.tables ?? [];
  return (models.value?.tables ?? []).filter(
    (table) =>
      table.name.toLowerCase().includes(query) ||
      table.columns.some((column) => column.name.toLowerCase().includes(query)),
  );
});

const selectedEnvironment = computed<ProjectDatabaseEnvironment | null>(
  () =>
    overview.value?.environments.find(
      (item) => item.id === selectedEnvironmentId.value,
    ) ??
    overview.value?.environments[0] ??
    null,
);

const selectedMigrationEntry = computed<RailsMigrationEntry | null>(
  () =>
    migrations.value?.migrations.find(
      (item) => item.version === selectedMigrationVersion.value,
    ) ??
    migrations.value?.migrations[0] ??
    null,
);

const migrationSourceHtml = computed(() => {
  const source = migrationDetail.value?.source;
  if (!source) return '';
  return highlightGitDiffCode(
    source,
    migrationDetail.value?.filePath || 'migration.rb',
  );
});

function openMigration(entry: RailsMigrationEntry): void {
  selectMigration(entry);
  migrationModalOpen.value = true;
}

function closeMigrationModal(): void {
  migrationModalOpen.value = false;
}

function handleDatabaseExplorerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && migrationModalOpen.value) closeMigrationModal();
}

const selectedTable = computed<RailsSchemaTable | null>(
  () =>
    models.value?.tables.find(
      (table) => table.name === selectedTableName.value,
    ) ??
    models.value?.tables[0] ??
    null,
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
  return item.serviceAvailable
    ? (systemdServiceByDriver[item.driver.toLowerCase()] ?? null)
    : null;
}

const sharedServiceEnvironments = computed<ProjectDatabaseEnvironment[]>(() => {
  const env = selectedEnvironment.value;
  if (!env) return [];
  const service = systemdServiceFor(env);
  if (!service) return [];
  return (overview.value?.environments ?? []).filter(
    (item) => item.id !== env.id && systemdServiceFor(item) === service,
  );
});

async function refreshAll(): Promise<void> {
  await Promise.all([loadDatabase(1), loadMigrations(), loadModels()]);
}

async function refreshActive(): Promise<void> {
  if (activeSection.value === 'overview') return refreshAll();
  if (activeSection.value === 'environments') return loadDatabase();
  if (activeSection.value === 'snapshots') return loadSnapshots();
  if (activeSection.value === 'migrations') return loadMigrations();
  if (activeSection.value === 'models') return loadModels();
}

function selectSection(section: DatabaseSection): void {
  activeSection.value = section;
}

function sectionFromQuery(): DatabaseSection {
  const value = Array.isArray(route?.query.section)
    ? route.query.section[0]
    : route?.query.section;
  const allowed: DatabaseSection[] = [
    'overview',
    'environments',
    'snapshots',
    'migrations',
    'models',
    'operations',
  ];
  if (!allowed.includes(value as DatabaseSection)) return 'overview';
  if (
    !isRailsProject.value &&
    !['overview', 'environments', 'snapshots'].includes(value ?? '')
  )
    return 'overview';
  return value as DatabaseSection;
}

async function copy(value: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    copiedKey.value = key;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedKey.value = '';
    }, 1_800);
  } catch {
    copiedKey.value = '';
  }
}

function columnTypeLabel(table: RailsSchemaTable, columnName: string): string {
  const column = table.columns.find((item) => item.name === columnName);
  if (!column) return '—';
  const details = [column.type];
  if (column.limit) details.push(String(column.limit));
  if (column.precision)
    details.push(
      `${column.precision}${column.scale !== undefined ? `,${column.scale}` : ''}`,
    );
  return details.length > 1
    ? `${details[0]}(${details.slice(1).join(', ')})`
    : (details[0] ?? '—');
}

watch(
  () => props.project.id,
  () => {
    activeSection.value = sectionFromQuery();
    globalFilter.value = '';
    migrationFilter.value = '';
    modelFilter.value = '';
    migrationModalOpen.value = false;
  },
  { immediate: true },
);

watch(
  () => route?.query.section,
  () => selectSection(sectionFromQuery()),
);

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template src="./ProjectDatabasePanel.template.html"></template>
