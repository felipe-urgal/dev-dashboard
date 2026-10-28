<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { NDropdown } from 'naive-ui';
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import { startProjectProcess, stopProjectProcess } from '../api';
import { dashboardStore } from '../stores/dashboard';
import { confirmDialog } from '../stores/app-dialog';
import { getCardGit, type CardGitState } from '../utils/dashboard-card-git';
import { projectTypeLabels } from '../utils/project-labels';
import { dangerMenuLabel } from '../utils/ui-menu';
import UiButton from './ui/UiButton.vue';

const props = defineProps<{
  project: Project;
  enabledUpdating?: boolean;
}>();

const emit = defineEmits<{
  'toggle-enabled': [project: Project];
}>();

const router = useRouter();

const supportsServer = computed(() =>
  props.project.capabilities.includes('server'),
);
const managedProcess = computed(() =>
  props.project.enabled
    ? dashboardStore.getCardProcess(props.project.id)
    : null,
);
const processStatus = computed(() =>
  !props.project.enabled
    ? 'stopped'
    : !dashboardStore.processReadComplete.value
      ? 'unknown'
      : (managedProcess.value?.status ?? 'stopped'),
);
const isRunning = computed(
  () => processStatus.value === 'running' || processStatus.value === 'starting',
);
const isTransitioning = computed(
  () =>
    processStatus.value === 'starting' || processStatus.value === 'stopping',
);
const statusLabel = computed(
  () =>
    ({
      starting: 'Iniciando',
      running: 'Executando',
      stopping: 'Encerrando',
      stopped: 'Parado',
      failed: 'Falhou',
      unknown: 'Desconhecido',
    })[processStatus.value],
);
const statusClass = computed(() => {
  if (!props.project.enabled) return 'disabled';
  return isRunning.value ? 'running' : processStatus.value;
});

const gitState = ref<CardGitState>({ kind: 'unknown' });
let branchRequest = 0;

watch(
  () => ({
    id: props.project.id,
    supportsGit: props.project.capabilities.includes('git'),
    enabled: props.project.enabled,
  }),
  async ({ id, supportsGit, enabled }) => {
    const request = ++branchRequest;
    gitState.value = supportsGit ? { kind: 'unknown' } : { kind: 'none' };
    if (!supportsGit || !enabled) return;
    const state = await getCardGit(id);
    if (request === branchRequest) gitState.value = state;
  },
  { immediate: true },
);

const gitFallback = computed(() => {
  if (!props.project.enabled) return '—';
  return {
    none: 'Sem Git',
    detached: 'HEAD detached',
    unknown: 'Git indisponível',
    branch: '',
  }[gitState.value.kind];
});

const localUrl = computed(() =>
  props.project.enabled &&
  processStatus.value === 'running' &&
  managedProcess.value?.port
    ? `http://localhost:${managedProcess.value.port}`
    : '',
);

const typeLabel = computed(() => projectTypeLabels[props.project.type]);
const stackCode: Record<Project['type'], string> = {
  rails: 'RB',
  node: 'JS',
  unknown: '—',
};

const serverBusy = ref(false);
const actionError = ref('');

const busy = computed(() => serverBusy.value || isTransitioning.value);
const buttonLabel = computed(() => {
  if (processStatus.value === 'stopping') return 'Parando…';
  if (processStatus.value === 'starting') return 'Iniciando…';
  if (serverBusy.value) return isRunning.value ? 'Parando…' : 'Iniciando…';
  return isRunning.value ? 'Parar' : 'Iniciar';
});
// Porta que o servidor usou por último: dá previsibilidade antes de iniciar.
const idlePort = computed(() =>
  props.project.enabled && !isRunning.value
    ? managedProcess.value?.port
    : undefined,
);

async function toggleServer(): Promise<void> {
  serverBusy.value = true;
  actionError.value = '';
  try {
    if (isRunning.value) await stopProjectProcess(props.project.id);
    else await startProjectProcess(props.project.id);
    await dashboardStore.loadProcessSummary();
  } catch (error) {
    actionError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível alterar o servidor.';
  } finally {
    serverBusy.value = false;
  }
}

// Desativar um projeto em execução para o servidor antes, para não deixar
// um processo órfão sem controle na interface.
async function requestToggleEnabled(): Promise<void> {
  if (props.project.enabled && isRunning.value) {
    const confirmed = await confirmDialog({
      title: 'Desativar projeto em execução?',
      message: `O servidor de ${props.project.name} está rodando e será parado antes de desativar o projeto.`,
      confirmLabel: 'Parar e desativar',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await stopProjectProcess(props.project.id);
      await dashboardStore.loadProcessSummary();
    } catch (error) {
      actionError.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível parar o servidor.';
      return;
    }
  }
  emit('toggle-enabled', props.project);
}

const menuOptions = computed(() => {
  const enabled = props.project.enabled;
  return [
    {
      key: 'open',
      label: 'Abrir app',
      disabled: !localUrl.value,
    },
    { key: 'logs', label: 'Ver logs', disabled: !enabled },
    { key: 'terminal', label: 'Terminal', disabled: !enabled },
    { key: 'git', label: 'Git', disabled: !enabled },
    { key: 'divider', type: 'divider' as const },
    {
      key: 'toggle',
      label: enabled ? dangerMenuLabel('Desativar projeto') : 'Ativar projeto',
    },
  ];
});

const routeByAction = {
  logs: 'project-server',
  terminal: 'project-terminal',
  git: 'project-git',
} as const;

function handleMenuSelect(key: string): void {
  if (key === 'open' && localUrl.value) {
    window.open(localUrl.value, '_blank', 'noopener,noreferrer');
  } else if (key === 'toggle') {
    void requestToggleEnabled();
  } else if (key in routeByAction) {
    void router.push({
      name: routeByAction[key as keyof typeof routeByAction],
      params: { projectId: props.project.id },
    });
  }
}
</script>

<template>
  <li
    class="project-row"
    :class="{ 'project-row-disabled': !project.enabled }"
    :data-state="statusClass"
  >
    <RouterLink
      class="project-row-hit-area"
      :to="{ name: 'project-details', params: { projectId: project.id } }"
      :aria-label="`Ver detalhes de ${project.name}`"
    />

    <div class="project-row-identity">
      <div
        class="project-row-avatar"
        :data-type="project.type"
        :title="typeLabel"
        aria-hidden="true"
      >
        {{ stackCode[project.type] }}
      </div>
      <div class="project-row-name">
        <h3 :title="project.path">{{ project.name }}</h3>
        <p v-if="actionError" class="project-row-error" role="alert">
          {{ actionError }}
        </p>
      </div>
    </div>

    <div class="project-row-git">
      <template v-if="gitState.kind === 'branch' && project.enabled">
        <span class="project-row-branch" :title="gitState.branch">{{
          gitState.branch
        }}</span>
        <span v-if="gitState.dirty" class="project-row-dirty">● alterado</span>
      </template>
      <span v-else class="project-row-muted">{{ gitFallback }}</span>
    </div>

    <div class="project-row-status">
      <span
        v-if="supportsServer"
        class="project-row-state"
        :data-state="statusClass"
      >
        <span class="project-row-dot" aria-hidden="true" />
        {{ project.enabled ? statusLabel : 'Desativado' }}
      </span>
      <span v-else class="project-row-muted">Sem servidor</span>
      <a
        v-if="localUrl"
        class="project-row-port"
        :href="localUrl"
        target="_blank"
        rel="noreferrer"
      >
        :{{ managedProcess?.port }}
      </a>
      <span v-else-if="idlePort" class="project-row-port-idle"
        >:{{ idlePort }}</span
      >
    </div>

    <div class="project-row-actions">
      <UiButton
        v-if="project.enabled && supportsServer"
        class="project-row-button"
        :variant="isRunning && !busy ? 'danger' : 'secondary'"
        :busy="busy"
        :disabled="busy"
        @click="toggleServer"
      >
        {{ buttonLabel }}
      </UiButton>

      <n-dropdown
        trigger="click"
        placement="bottom-end"
        :options="menuOptions"
        :disabled="enabledUpdating"
        @select="handleMenuSelect"
      >
        <UiButton
          icon
          variant="ghost"
          :aria-label="`Mais ações de ${project.name}`"
          aria-haspopup="menu"
        >
          <EllipsisVerticalIcon aria-hidden="true" />
        </UiButton>
      </n-dropdown>
    </div>
  </li>
</template>

<style scoped>
.project-row {
  position: relative;
  display: grid;
  grid-template-columns: var(--overview-columns);
  align-items: center;
  gap: 16px;
  min-height: 72px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  transition: background 160ms ease;
}

.project-row:first-child {
  border-top: 0;
}

.project-row:hover {
  background: var(--surface-2);
}

.project-row-disabled {
  opacity: 0.6;
}

.project-row-hit-area {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
}

.project-row-hit-area:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.project-row-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
}

.project-row-avatar {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 13px;
  font-weight: 750;
}

.project-row-avatar[data-type='rails'] {
  border-color: transparent;
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 14%, transparent);
}

.project-row-avatar[data-type='node'] {
  border-color: transparent;
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 14%, transparent);
}

.project-row:hover .project-row-name h3 {
  color: var(--accent);
}

.project-row-name {
  min-width: 0;
}

.project-row-name h3 {
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-row-error {
  margin: 2px 0 0;
  color: var(--danger-text);
  font-size: 12px;
}

.project-row-git,
.project-row-status {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 13px;
}

.project-row-branch {
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-row-dirty {
  flex: 0 0 auto;
  color: var(--warning-text);
  font-size: 12px;
}

.project-row-muted {
  color: var(--text-dim);
}

.project-row-state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.project-row-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
}

.project-row-state[data-state='running'] {
  color: var(--success-text);
}

.project-row-state[data-state='running'] .project-row-dot {
  background: var(--success-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-text) 22%, transparent);
}

.project-row-state[data-state='starting'] .project-row-dot,
.project-row-state[data-state='stopping'] .project-row-dot {
  background: var(--warning-text);
}

.project-row-state[data-state='failed'] {
  color: var(--danger-text);
}

.project-row-state[data-state='failed'] .project-row-dot {
  background: var(--danger-text);
}

.project-row-port {
  position: relative;
  z-index: 2;
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.project-row-port:hover {
  text-decoration: underline;
}

.project-row-port-idle {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.project-row-actions {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.project-row-port:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 760px) {
  .project-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px 12px;
    padding: 14px 16px;
  }

  .project-row-git,
  .project-row-status {
    grid-column: 1;
  }

  .project-row-actions {
    grid-column: 2;
    grid-row: 1 / span 3;
  }
}

.project-row-button {
  min-width: 96px;
}
</style>
