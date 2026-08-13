<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { NoSymbolIcon, PowerIcon } from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';

const props = defineProps<{
  project: Project;
  enabledUpdating?: boolean;
}>();

const emit = defineEmits<{
  'toggle-enabled': [project: Project];
}>();

const { managedProcess, supportsServer, isRunning } = useProjectProcessStatus(
  () => props.project,
);

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
      // A branch é um metadado complementar; a linha continua utilizável
      // quando o Git não puder ser consultado.
    }
  },
  { immediate: true },
);

const statusDotClass = computed(() =>
  isRunning.value ? 'project-status-dot-running' : 'project-status-dot-stopped',
);

const statusLabel = computed(() => {
  if (!props.project.enabled) {
    return 'Desativado';
  }

  return isRunning.value ? 'Em execução' : 'Parado';
});

const displayStatusLabel = computed(() => {
  if (!props.project.enabled) {
    return 'Desativado';
  }

  return isRunning.value ? 'Online' : 'Offline';
});

const toggleEnabledLabel = computed(() =>
  props.project.enabled
    ? `Desativar ${props.project.name}`
    : `Ativar ${props.project.name}`,
);

const projectDetailsRoute = computed(() => ({
  name: 'project-details',
  params: { projectId: props.project.id },
}));

const localUrl = computed(() =>
  props.project.enabled && managedProcess.value?.port
    ? `http://localhost:${managedProcess.value.port}`
    : '',
);
</script>

<template>
  <li class="project-row" :class="{ 'project-row-disabled': !project.enabled }">
    <div class="project-row-link">
      <div class="project-cell project-cell-project project-row-identity">
        <RouterLink
          class="project-project-link"
          :to="projectDetailsRoute"
          :aria-label="`Ver detalhes de ${project.name}`"
        >
          <h3>{{ project.name }}</h3>
          <code class="project-path">{{ project.path }}</code>
        </RouterLink>
      </div>

      <div class="project-cell project-cell-branch">
        <RouterLink
          v-if="currentBranch"
          class="project-metadata-link"
          :to="projectDetailsRoute"
          :title="`Branch atual: ${currentBranch}`"
        >
          <span class="project-branch-badge">
            <span aria-hidden="true">⑂</span>
            {{ currentBranch }}
          </span>
        </RouterLink>
        <span v-else class="project-placeholder">—</span>
      </div>

      <div v-if="supportsServer" class="project-cell project-cell-status">
        <span
          class="project-status project-row-status"
          :aria-label="statusLabel"
          :title="statusLabel"
        >
          <span
            class="project-status-dot"
            :class="statusDotClass"
            aria-hidden="true"
          />
          <span>{{ displayStatusLabel }}</span>
        </span>
      </div>
      <div v-else class="project-cell project-cell-status project-placeholder">
        —
      </div>

      <div class="project-cell project-cell-port">
        <a
          v-if="localUrl"
          class="project-port-link"
          :href="localUrl"
          target="_blank"
          rel="noreferrer"
        >
          <span class="project-port-badge"
            >Porta {{ managedProcess?.port }}</span
          >
        </a>
        <span v-else class="project-placeholder">—</span>
      </div>

      <div class="project-cell project-cell-action">
        <div class="project-row-actions" aria-label="Ações do projeto">
          <button
            type="button"
            class="project-disable-button"
            :class="{ active: !project.enabled }"
            :aria-label="toggleEnabledLabel"
            :title="toggleEnabledLabel"
            :aria-pressed="!project.enabled"
            :disabled="enabledUpdating"
            @click="emit('toggle-enabled', project)"
          >
            <PowerIcon v-if="project.enabled" aria-hidden="true" />
            <NoSymbolIcon v-else aria-hidden="true" />
            <span>{{ project.enabled ? 'Desativar' : 'Ativar' }}</span>
          </button>
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped>
.project-row-link {
  display: grid;
  grid-template-columns:
    minmax(260px, 1.8fr) minmax(180px, 1.25fr)
    120px 130px 150px;
  align-items: center;
  gap: 18px;
  min-height: 88px;
  padding: 16px 18px;
}

.project-cell {
  min-width: 0;
}

.project-project-link,
.project-metadata-link {
  display: grid;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.project-project-link {
  gap: 5px;
}

.project-project-link h3 {
  overflow: hidden;
  margin: 0;
  color: var(--info-text);
  font-size: 14px;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
}

.project-project-link:hover h3,
.project-metadata-link:hover,
.project-port-link:hover {
  color: var(--accent-strong);
}

.project-path {
  overflow: hidden;
  color: var(--info-text);
  text-overflow: ellipsis;
  text-decoration: underline;
  text-underline-offset: 2px;
  white-space: nowrap;
}

.project-metadata-link {
  display: inline-flex;
  width: fit-content;
}

.project-branch-badge {
  max-width: 100%;
  border-color: transparent;
  padding-left: 0;
  color: var(--info-text);
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.project-port-link {
  color: var(--info-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.project-placeholder {
  color: var(--text-dim);
}

.project-row-status {
  position: static;
  display: inline-flex;
  width: auto;
  justify-content: flex-start;
  transform: none;
}

.project-row-actions {
  position: static;
  width: auto;
  transform: none;
}

.project-disable-button {
  display: inline-flex;
  width: auto;
  height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--danger-text);
  background: var(--danger-surface);
  white-space: nowrap;
}

.project-disable-button svg {
  width: 16px;
  height: 16px;
}

.project-disable-button:hover,
.project-disable-button:focus-visible,
.project-disable-button.active {
  color: var(--danger-text);
  background: var(--danger-surface);
}

@media (max-width: 900px) {
  .project-row-link {
    grid-template-columns:
      minmax(220px, 1.5fr) minmax(150px, 1fr)
      100px 100px 125px;
    gap: 10px;
    padding-inline: 12px;
  }

  .project-disable-button {
    padding-inline: 8px;
  }

  .project-disable-button span {
    display: none;
  }
}

@media (max-width: 680px) {
  .project-row-link {
    grid-template-columns: 1fr auto;
    gap: 8px 14px;
  }

  .project-cell-branch,
  .project-cell-status,
  .project-cell-port {
    grid-column: 1 / -1;
  }

  .project-cell-action {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
