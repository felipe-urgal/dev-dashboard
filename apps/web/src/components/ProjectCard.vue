<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { NoSymbolIcon, PowerIcon } from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import { projectTypeLabels } from '../utils/project-labels';
import ProjectProcessesMenu from './ProjectProcessesMenu.vue';

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

    if (!supportsGit) return;

    try {
      const overview = await fetchProjectGit(id);

      if (request === branchRequest && overview.repository) {
        currentBranch.value = overview.branch ?? '';
      }
    } catch {
      // A branch é metadado complementar; o card continua utilizável sem Git.
    }
  },
  { immediate: true },
);

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
  props.project.enabled && isRunning.value && managedProcess.value?.port
    ? `http://localhost:${managedProcess.value.port}`
    : '',
);

const statusClass = computed(() => {
  if (!props.project.enabled) return 'disabled';
  if (isRunning.value) return 'running';
  return 'stopped';
});
</script>

<template>
  <li
    class="project-card"
    :class="{ 'project-card-disabled': !project.enabled }"
    :data-state="statusClass"
  >
    <div
      class="project-card-avatar"
      :data-type="project.type"
      :title="typeLabel"
      aria-hidden="true"
    >
      {{ typeCode }}
    </div>

    <div class="project-card-main">
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

      <div class="project-card-meta">
        <RouterLink
          v-if="currentBranch"
          class="project-card-branch"
          :to="projectDetailsRoute"
          :title="`Branch atual: ${currentBranch}`"
        >
          <span class="project-card-branch-icon" aria-hidden="true">⑂</span>
          <span>{{ currentBranch }}</span>
        </RouterLink>
        <span v-else class="project-card-muted-pill">Sem Git</span>

        <span
          v-if="supportsServer"
          class="project-card-status"
          :data-state="statusClass"
        >
          <span class="project-card-status-dot" aria-hidden="true" />
          {{ project.enabled ? statusLabel : 'Desativado' }}
        </span>
        <span v-else class="project-card-muted-pill">Sem servidor</span>

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
    </div>

    <div class="project-card-actions">
      <ProjectProcessesMenu
        v-if="project.enabled"
        :project="project"
        :eager="false"
      />

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
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  min-height: 126px;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-1) 92%, var(--surface-2));
  box-shadow: 0 1px 0 rgb(255 255 255 / 2%) inset;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.project-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-1);
  transform: translateY(-1px);
}

.project-card-disabled {
  opacity: 0.66;
}

.project-card-avatar {
  display: grid;
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 4%);
}

.project-card-avatar[data-type='rails'] {
  color: #ffb7b0;
  background: #51231f;
}

.project-card-avatar[data-type='node'] {
  color: #f0fff4;
  background: #1a7f37;
}

.project-card-avatar[data-type='unknown'] {
  color: var(--text-muted);
  background: var(--surface-3);
}

.project-card-main {
  min-width: 0;
}

.project-card-identity {
  display: grid;
  min-width: 0;
  gap: 4px;
  color: inherit;
  text-decoration: none;
}

.project-card-identity h3 {
  overflow: hidden;
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card-identity:hover h3,
.project-card-identity:focus-visible h3 {
  color: var(--info-text);
}

.project-card-path {
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-family);
  font-size: 14px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card-meta {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 9px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.project-card-branch,
.project-card-status,
.project-card-muted-pill,
.project-card-port {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.project-card-branch {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  color: #79c0ff;
  background: color-mix(in srgb, var(--accent-soft) 62%, transparent);
  text-decoration: none;
}

[data-theme='light'] .project-card-branch {
  color: var(--accent);
  background: var(--accent-soft);
}

.project-card-branch:hover,
.project-card-branch:focus-visible {
  border-color: var(--accent);
}

.project-card-branch-icon {
  font-size: 13px;
}

.project-card-status,
.project-card-muted-pill {
  color: var(--text-muted);
  background: var(--surface-3);
}

.project-card-status-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #8b949e;
}

.project-card-status[data-state='running'] {
  color: var(--success-text);
  background: var(--success-surface);
}

.project-card-status[data-state='running'] .project-card-status-dot {
  background: var(--success-text);
}

.project-card-status[data-state='disabled'] .project-card-status-dot {
  background: var(--text-dim);
}

.project-card-port {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--info-text);
  background: var(--accent-soft);
  text-decoration: none;
}

.project-card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 10px;
}

.project-card-actions :deep(.processes-menu-trigger),
.project-card-toggle {
  width: 48px;
  height: 48px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
}

.project-card-actions :deep(.processes-menu-trigger:hover),
.project-card-actions :deep(.processes-menu-trigger:focus-visible),
.project-card-toggle:hover,
.project-card-toggle:focus-visible {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-2);
}

.project-card-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  cursor: pointer;
}

.project-card-toggle::before {
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: -13px;
  width: 1px;
  background: var(--border);
  content: '';
}

.project-card-toggle svg {
  width: 21px;
  height: 21px;
}

.project-card-toggle:hover,
.project-card-toggle:focus-visible {
  color: var(--danger-text);
}

.project-card-toggle.active:hover,
.project-card-toggle.active:focus-visible {
  color: var(--accent);
}

.project-card-toggle:disabled {
  cursor: wait;
  opacity: 0.55;
}

@media (max-width: 760px) {
  .project-card {
    grid-template-columns: 48px minmax(0, 1fr);
    min-height: 0;
    gap: 14px;
    padding: 16px;
  }

  .project-card-avatar {
    width: 48px;
    height: 48px;
    font-size: 15px;
  }

  .project-card-actions {
    grid-column: 2;
    justify-content: flex-start;
    padding: 2px 0 0;
  }

  .project-card-toggle::before {
    display: none;
  }

  .project-card-actions :deep(.processes-menu-trigger),
  .project-card-toggle {
    width: 40px;
    height: 40px;
  }
}
</style>
