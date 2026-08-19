<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { NoSymbolIcon, PowerIcon } from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { projectTypeLabels } from '../utils/project-labels';
import ProjectProcessesMenu from './ProjectProcessesMenu.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  project: Project;
  enabledUpdating?: boolean;
}>();

const emit = defineEmits<{
  'toggle-enabled': [project: Project];
}>();

const { managedProcess, supportsServer, isRunning, statusLabel } =
  useProjectProcessStatus(() => props.project);

const currentBranch = ref('');
let branchRequest = 0;

watch(
  () => ({
    id: props.project.id,
    supportsGit: props.project.capabilities.includes('git'),
  }),
  async ({ id, supportsGit }) => {
    const request = ++branchRequest;
    currentBranch.value = '';

    if (!supportsGit) {
      return;
    }

    try {
      const overview = await fetchProjectGit(id);

      if (request === branchRequest && overview.repository) {
        currentBranch.value = overview.branch ?? '';
      }
    } catch {
      // A branch é um metadado complementar; o card continua utilizável
      // quando o Git não puder ser consultado.
    }
  },
  { immediate: true },
);

const statusTone = computed(() => (isRunning.value ? 'success' : 'neutral'));

const toggleEnabledLabel = computed(() =>
  props.project.enabled
    ? `Desativar ${props.project.name}`
    : `Ativar ${props.project.name}`,
);

const projectDetailsRoute = computed(() => ({
  name: 'project-details',
  params: { projectId: props.project.id },
}));

const stackCode: Record<Project['type'], string> = {
  rails: 'RB',
  node: 'JS',
  unknown: '—',
};

const typeLabel = computed(() => projectTypeLabels[props.project.type]);
const typeCode = computed(() => stackCode[props.project.type]);

const localUrl = computed(() =>
  props.project.enabled && managedProcess.value?.port
    ? `http://localhost:${managedProcess.value.port}`
    : '',
);
</script>

<template>
  <li
    class="project-card"
    :class="{ 'project-card-disabled': !project.enabled }"
    :data-state="
      !project.enabled ? 'disabled' : isRunning ? 'running' : 'stopped'
    "
  >
    <div class="project-card-head">
      <div
        class="project-card-avatar"
        :data-type="project.type"
        :title="typeLabel"
        aria-hidden="true"
      >
        {{ typeCode }}
      </div>

      <RouterLink
        class="project-card-identity"
        :to="projectDetailsRoute"
        :aria-label="`Ver detalhes de ${project.name}`"
      >
        <h3>{{ project.name }}</h3>
        <code class="project-card-path" :title="project.path">{{
          project.path
        }}</code>
      </RouterLink>

      <ProjectProcessesMenu
        v-if="project.enabled"
        :project="project"
        :eager="false"
      />
    </div>

    <div class="project-card-meta">
      <RouterLink
        v-if="currentBranch"
        class="project-card-branch"
        :to="projectDetailsRoute"
        :title="`Branch atual: ${currentBranch}`"
      >
        <span aria-hidden="true">⑂</span>
        <span>{{ currentBranch }}</span>
      </RouterLink>
      <span v-else class="project-placeholder">Sem Git</span>

      <a
        v-if="localUrl"
        class="project-card-port"
        :href="localUrl"
        target="_blank"
        rel="noreferrer"
      >
        :{{ managedProcess?.port }}
      </a>
    </div>

    <div class="project-card-foot">
      <StatusBadge v-if="supportsServer" :tone="statusTone">
        {{ statusLabel }}
      </StatusBadge>
      <span v-else class="project-placeholder">Sem servidor</span>

      <button
        type="button"
        class="project-card-toggle"
        :class="{ active: !project.enabled }"
        :aria-label="toggleEnabledLabel"
        :title="toggleEnabledLabel"
        :aria-pressed="!project.enabled"
        :disabled="enabledUpdating"
        @click="emit('toggle-enabled', project)"
      >
        <PowerIcon v-if="project.enabled" aria-hidden="true" />
        <NoSymbolIcon v-else aria-hidden="true" />
      </button>
    </div>
  </li>
</template>

<style scoped>
.project-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.project-card[data-state='running'] {
  border-left-color: var(--success-text);
}

.project-card-disabled {
  border-left-color: transparent;
  opacity: 0.62;
}

.project-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.project-card-avatar {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.project-card-avatar[data-type='rails'] {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.project-card-avatar[data-type='node'] {
  color: var(--success-text);
  background: var(--success-surface);
}

.project-card-avatar[data-type='unknown'] {
  color: var(--text-muted);
  background: var(--surface-3);
}

.project-card-identity {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 3px;
  color: inherit;
  text-decoration: none;
}

.project-card-identity h3 {
  overflow: hidden;
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card-identity:hover h3 {
  color: var(--accent);
}

.project-card-path {
  overflow: hidden;
  color: var(--text-dim);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card-meta {
  display: flex;
  min-height: 21px;
  align-items: center;
  gap: 6px;
}

.project-card-branch {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 10px;
  text-decoration: none;
}

.project-card-branch span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card-branch:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.project-card-port {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  color: var(--accent);
  background: var(--accent-soft);
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  text-decoration: none;
}

.project-card-port:hover {
  border-color: var(--accent);
}

.project-placeholder {
  color: var(--text-dim);
  font-size: 11px;
}

.project-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.project-card-toggle {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-2);
  transition:
    color 160ms ease,
    background 160ms ease,
    border-color 160ms ease;
}

.project-card-toggle svg {
  width: 15px;
  height: 15px;
}

.project-card-toggle:hover,
.project-card-toggle:focus-visible {
  color: var(--danger-text);
  background: var(--danger-surface);
  border-color: var(--danger-text);
}

.project-card-toggle.active {
  color: var(--text-dim);
}

.project-card-toggle.active:hover,
.project-card-toggle.active:focus-visible {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent);
}

.project-card-toggle:disabled {
  cursor: wait;
  opacity: 0.55;
}
</style>
