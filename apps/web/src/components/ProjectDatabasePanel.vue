<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  ArrowPathIcon,
  CircleStackIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  PauseIcon,
  PlayIcon,
  ServerStackIcon,
} from '@heroicons/vue/24/outline';

import type {
  DatabaseServiceAction,
  Project,
  ProjectDatabaseEnvironment,
} from '@dev-dashboard/contracts';

import { useProjectDatabaseOverview } from '../composables/useProjectDatabaseOverview';
import { dbReachabilityToneFor } from '../utils/status-tones';
import ProjectToolHeader from './ProjectToolHeader.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const {
  overview,
  loading,
  revealed,
  page,
  pendingAction,
  selectedEnvironmentId,
  loadDatabase,
  reveal,
  runAction,
} = useProjectDatabaseOverview(() => props.project);

const copiedKey = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const pages = computed(() =>
  Math.max(
    1,
    Math.ceil((overview.value?.total ?? 0) / (overview.value?.pageSize ?? 20)),
  ),
);

const selectedEnvironment = computed<ProjectDatabaseEnvironment | null>(
  () =>
    overview.value?.environments.find(
      (item) => item.id === selectedEnvironmentId.value,
    ) ??
    overview.value?.environments[0] ??
    null,
);

const reachabilityLabels = {
  reachable: 'Acessível',
  unreachable: 'Indisponível',
  unknown: 'Não verificado',
} as const;

const serviceActionLabels: Record<DatabaseServiceAction, string> = {
  start: 'Iniciando…',
  stop: 'Pausando…',
  restart: 'Reiniciando…',
};

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

const sharedServiceEnvironmentNames = computed(() =>
  sharedServiceEnvironments.value.map((item) => item.environment).join(', '),
);

const selectedServiceState = computed(() =>
  selectedEnvironment.value?.serviceAvailable
    ? 'Gerenciamento local disponível'
    : 'Somente leitura',
);

function handleDatabaseExplorerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    copiedKey.value = '';
  }
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

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template src="./ProjectDatabasePanel.template.html"></template>
