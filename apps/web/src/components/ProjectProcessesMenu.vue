<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NPopover } from 'naive-ui';
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline';

import type {
  DatabaseServiceAction,
  Project,
  ProjectDatabaseEnvironment,
  RailsWorkerId,
} from '@dev-dashboard/contracts';

import { startProjectProcess, stopProjectProcess } from '../api';
import {
  fetchProjectDatabase,
  runProjectDatabaseServiceAction,
} from '../api/rails';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';

const props = withDefaults(
  defineProps<{ project: Project; eager?: boolean }>(),
  { eager: true },
);
const emit = defineEmits<{
  'database-supported': [supported: boolean];
  'worker-detected': [workerId: RailsWorkerId, detected: boolean];
}>();

const serverBusy = ref<'start' | 'stop' | null>(null);
const errorMessage = ref('');

const server = useProjectProcessStatus(() => props.project);
const sidekiq = useProjectRailsWorker(
  () => props.project,
  'sidekiq',
  true,
  props.eager,
);
const webpack = useProjectRailsWorker(
  () => props.project,
  'webpack',
  false,
  props.eager,
);

const databaseEnvironment = ref<ProjectDatabaseEnvironment | null>(null);
const databaseBusy = ref<DatabaseServiceAction | null>(null);
let databaseGeneration = 0;
let databaseLoadedProjectId = '';
let databaseLoadPromise: Promise<void> | undefined;

async function loadDatabaseEnvironment(force = false): Promise<void> {
  if (!force && databaseLoadedProjectId === props.project.id) return;
  if (!force && databaseLoadPromise) return databaseLoadPromise;

  const current = ++databaseGeneration;
  const projectId = props.project.id;
  const pending = (async () => {
    try {
      const overview = await fetchProjectDatabase(projectId, 1);
      if (current !== databaseGeneration) return;
      emit('database-supported', overview.supported);
      databaseEnvironment.value =
        overview.supported && overview.environments[0]?.serviceAvailable
          ? overview.environments[0]
          : null;
      databaseLoadedProjectId = projectId;
    } catch {
      if (current === databaseGeneration) databaseEnvironment.value = null;
    }
  })();
  databaseLoadPromise = pending;
  try {
    await pending;
  } finally {
    if (databaseLoadPromise === pending) databaseLoadPromise = undefined;
  }
}

watch(
  () => props.project.id,
  () => void loadDatabaseEnvironment(),
  {
    immediate: props.eager,
  },
);
watch(
  () => sidekiq.detected.value,
  (detected) => emit('worker-detected', 'sidekiq', detected),
  { immediate: true },
);
watch(
  () => webpack.detected.value,
  (detected) => emit('worker-detected', 'webpack', detected),
  { immediate: true },
);

async function runDatabaseAction(action: DatabaseServiceAction): Promise<void> {
  const environment = databaseEnvironment.value;
  if (!environment) return;
  databaseBusy.value = action;
  errorMessage.value = '';
  try {
    await runProjectDatabaseServiceAction(
      props.project.id,
      environment.id,
      action,
    );
    await loadDatabaseEnvironment(true);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : `Não foi possível ${action === 'start' ? 'iniciar' : 'parar'} o banco.`;
  } finally {
    databaseBusy.value = null;
  }
}

function ensureMenuLoaded(): void {
  if (props.eager) return;
  void Promise.all([
    sidekiq.initialize(),
    webpack.initialize(),
    loadDatabaseEnvironment(),
  ]);
}

const databaseStatusLabel = computed(() => {
  switch (databaseEnvironment.value?.reachability) {
    case 'reachable':
      return 'Em execução';
    case 'unreachable':
      return 'Parado';
    default:
      return 'Desconhecido';
  }
});

const workerLabels: Record<RailsWorkerId, string> = {
  sidekiq: 'Sidekiq',
  webpack: 'Webpack',
};

interface ProcessItem {
  key: string;
  label: string;
  running: boolean;
  busy: boolean;
  statusLabel: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

async function startServer(): Promise<void> {
  serverBusy.value = 'start';
  errorMessage.value = '';
  try {
    const nextProcess = await startProjectProcess(props.project.id);
    server.managedProcess.value = nextProcess;
    server.scheduleProcessPolling();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar o servidor.';
  } finally {
    serverBusy.value = null;
  }
}

async function stopServer(): Promise<void> {
  serverBusy.value = 'stop';
  errorMessage.value = '';
  try {
    const nextProcess = await stopProjectProcess(props.project.id);
    server.managedProcess.value = nextProcess;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível parar o servidor.';
  } finally {
    serverBusy.value = null;
  }
}

const isRailsProject = computed(() => props.project.type === 'rails');

const items = computed<ProcessItem[]>(() => {
  const list: ProcessItem[] = [];

  if (server.supportsServer.value) {
    list.push({
      key: 'server',
      label: 'Servidor',
      running: server.canStop.value,
      busy: serverBusy.value !== null,
      statusLabel: server.statusLabel.value,
      start: startServer,
      stop: stopServer,
    });
  }

  if (
    isRailsProject.value &&
    sidekiq.supportsWorker.value &&
    sidekiq.detected.value
  ) {
    list.push({
      key: 'sidekiq',
      label: workerLabels.sidekiq,
      running: sidekiq.canStop.value,
      busy: sidekiq.currentAction.value !== null,
      statusLabel: sidekiq.statusLabel.value,
      start: sidekiq.start,
      stop: sidekiq.stop,
    });
  }

  if (
    isRailsProject.value &&
    webpack.supportsWorker.value &&
    webpack.detected.value
  ) {
    list.push({
      key: 'webpack',
      label: workerLabels.webpack,
      running: webpack.canStop.value,
      busy: webpack.currentAction.value !== null,
      statusLabel: webpack.statusLabel.value,
      start: webpack.start,
      stop: webpack.stop,
    });
  }

  if (databaseEnvironment.value) {
    list.push({
      key: 'database',
      label: 'Banco de dados',
      running: databaseEnvironment.value.reachability === 'reachable',
      busy: databaseBusy.value !== null,
      statusLabel: databaseStatusLabel.value,
      start: () => runDatabaseAction('start'),
      stop: () => runDatabaseAction('stop'),
    });
  }

  return list;
});

const runningCount = computed(
  () => items.value.filter((item) => item.running).length,
);
const startableItems = computed(() =>
  items.value.filter((item) => !item.running && !item.busy),
);
const stoppableItems = computed(() =>
  items.value.filter((item) => item.running && !item.busy),
);
const bulkBusy = ref<'start' | 'stop' | null>(null);

async function startAll(): Promise<void> {
  if (bulkBusy.value) return;
  bulkBusy.value = 'start';
  errorMessage.value = '';

  const targetKeys = new Set(startableItems.value.map((item) => item.key));
  await Promise.allSettled(startableItems.value.map((item) => item.start()));

  const stillStopped = items.value.filter(
    (item) => targetKeys.has(item.key) && !item.running,
  ).length;

  if (stillStopped > 0) {
    errorMessage.value = `Não foi possível iniciar ${stillStopped} de ${targetKeys.size} processo(s).`;
  }

  bulkBusy.value = null;
}

async function stopAll(): Promise<void> {
  if (bulkBusy.value) return;
  bulkBusy.value = 'stop';
  errorMessage.value = '';

  const targetKeys = new Set(stoppableItems.value.map((item) => item.key));
  await Promise.allSettled(stoppableItems.value.map((item) => item.stop()));

  const stillRunning = items.value.filter(
    (item) => targetKeys.has(item.key) && item.running,
  ).length;

  if (stillRunning > 0) {
    errorMessage.value = `Não foi possível parar ${stillRunning} de ${targetKeys.size} processo(s).`;
  }

  bulkBusy.value = null;
}

async function toggleItem(item: ProcessItem): Promise<void> {
  if (item.busy) return;
  await (item.running ? item.stop() : item.start());
}
</script>

<template>
  <NPopover
    v-if="items.length > 0 || !props.eager"
    trigger="click"
    placement="bottom-end"
    raw
    :show-arrow="false"
    class="processes-menu-panel"
  >
    <template #trigger>
      <button
        type="button"
        class="processes-menu-trigger"
        aria-haspopup="true"
        aria-label="Processos do projeto"
        @click="ensureMenuLoaded"
      >
        <EllipsisVerticalIcon aria-hidden="true" />
        <span v-if="runningCount > 0" class="processes-menu-count">
          {{ runningCount }}
        </span>
      </button>
    </template>

    <div role="menu">
      <p v-if="errorMessage" class="processes-menu-error" role="alert">
        {{ errorMessage }}
      </p>

      <div v-for="item in items" :key="item.key" class="processes-menu-item">
        <span class="processes-menu-item-info">
          <span
            class="processes-menu-dot"
            :class="{ 'processes-menu-dot-on': item.running }"
            aria-hidden="true"
          />
          <span class="processes-menu-item-text">
            <span class="processes-menu-item-name">{{ item.label }}</span>
            <span class="processes-menu-item-status">{{
              item.statusLabel
            }}</span>
          </span>
        </span>
        <button
          type="button"
          class="processes-menu-item-action"
          :class="{ 'is-stop': item.running }"
          :disabled="item.busy"
          @click="toggleItem(item)"
        >
          {{ item.busy ? '…' : item.running ? 'Parar' : 'Iniciar' }}
        </button>
      </div>

      <div class="processes-menu-divider" />

      <div class="processes-menu-bulk">
        <button
          type="button"
          class="menu-item"
          :disabled="startableItems.length === 0 || bulkBusy !== null"
          @click="startAll"
        >
          <span>{{
            bulkBusy === 'start' ? 'Iniciando tudo…' : 'Iniciar tudo'
          }}</span>
        </button>
        <button
          type="button"
          class="menu-item danger"
          :disabled="stoppableItems.length === 0 || bulkBusy !== null"
          @click="stopAll"
        >
          <span>{{
            bulkBusy === 'stop' ? 'Parando tudo…' : 'Parar tudo'
          }}</span>
          <span v-if="runningCount > 0" class="processes-menu-count-inline">
            {{ runningCount }}
          </span>
        </button>
      </div>
    </div>
  </NPopover>
</template>

<style scoped>
.processes-menu-trigger {
  position: relative;
  display: grid;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
  place-items: center;
  cursor: pointer;
}

.processes-menu-trigger:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.processes-menu-trigger svg {
  width: 18px;
  height: 18px;
}

.processes-menu-count {
  position: absolute;
  top: -5px;
  right: -5px;
  display: inline-grid;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  color: #fff;
  background: var(--danger-text);
  font-size: 9px;
  font-weight: 800;
  place-items: center;
}
</style>

<style>
.processes-menu-panel {
  width: 260px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.processes-menu-error {
  margin: 2px 4px 8px;
  color: var(--danger-text);
  font-size: 11px;
}

.processes-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
}

.processes-menu-item:hover {
  background: var(--surface-2);
}

.processes-menu-item-info {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.processes-menu-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--text-dim);
}

.processes-menu-dot-on {
  background: var(--success-text);
}

.processes-menu-item-text {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.processes-menu-item-name {
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
}

.processes-menu-item-status {
  color: var(--text-dim);
  font-size: 10px;
}

.processes-menu-item-action {
  flex: 0 0 auto;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.processes-menu-item-action:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.processes-menu-item-action.is-stop:hover:not(:disabled) {
  border-color: var(--danger-text);
  color: var(--danger-text);
  background: var(--danger-surface);
}

.processes-menu-item-action:disabled {
  cursor: wait;
  opacity: 0.6;
}

.processes-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: var(--border);
}

.processes-menu-bulk {
  display: grid;
  gap: 2px;
}

.processes-menu-bulk .menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 9px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.processes-menu-bulk .menu-item:hover:not(:disabled) {
  background: var(--surface-2);
}

.processes-menu-bulk .menu-item:disabled {
  color: var(--text-dim);
  cursor: default;
}

.processes-menu-bulk .menu-item.danger {
  color: var(--danger-text);
}

.processes-menu-bulk .menu-item.danger:hover:not(:disabled) {
  background: var(--danger-surface);
}

.processes-menu-bulk .menu-item.danger:disabled {
  color: var(--text-dim);
}

.processes-menu-count-inline {
  display: inline-grid;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 999px;
  color: #fff;
  background: var(--danger-text);
  font-size: 9px;
  font-weight: 800;
  place-items: center;
}
</style>
