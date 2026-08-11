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
  isRunning.value
    ? 'project-status-dot-running'
    : 'project-status-dot-stopped',
);

const statusLabel = computed(() =>
  isRunning.value ? 'Em execução' : 'Parado',
);
</script>

<template>
  <li class="project-row" :class="{ 'project-row-disabled': !project.enabled }">
    <span
      v-if="supportsServer"
      class="project-status project-row-status"
      :aria-label="statusLabel"
      :title="statusLabel"
    >
      <span
        class="project-status-dot"
        :class="statusDotClass"
        aria-hidden="true"
      />
    </span>

    <div class="project-row-actions" aria-label="Ações do projeto">
      <button
        type="button"
        class="project-disable-button"
        :class="{ active: !project.enabled }"
        :aria-label="
          project.enabled
            ? `Desativar ${project.name}`
            : `Reativar ${project.name}`
        "
        :aria-pressed="!project.enabled"
        :disabled="enabledUpdating"
        @click="emit('toggle-enabled', project)"
      >
        <PowerIcon v-if="project.enabled" aria-hidden="true" />
        <NoSymbolIcon v-else aria-hidden="true" />
      </button>
    </div>

    <RouterLink
      class="project-row-link"
      :aria-label="`Ver detalhes de ${project.name}`"
      :to="{
        name: 'project-details',
        params: {
          projectId: project.id,
        },
      }"
    >
      <div class="project-row-identity">
        <div class="project-row-heading">
          <div class="project-row-title">
            <h3>{{ project.name }}</h3>
          </div>

          <div class="project-row-badges">
            <span
              v-if="!project.enabled"
              class="project-disabled-badge"
              aria-label="Projeto desativado"
            >
              Desativado
            </span>
          </div>
        </div>

        <code class="project-path">{{ project.path }}</code>

        <div
          v-if="currentBranch || managedProcess?.port"
          class="project-row-meta"
        >
          <span
            v-if="currentBranch"
            class="project-branch-badge"
            :title="`Branch atual: ${currentBranch}`"
          >
            <span aria-hidden="true">⑂</span>
            {{ currentBranch }}
          </span>

          <span v-if="managedProcess?.port" class="project-port-badge">
            Porta {{ managedProcess.port }}
          </span>
        </div>
      </div>
    </RouterLink>
  </li>
</template>

<style scoped>
.project-row {
  position: relative;
}

.project-row-link {
  padding-left: 20px;
  padding-right: 64px;
}

.project-row-heading {
  padding-right: 0;
}

.project-row-status {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 18px;
  min-width: 0;
  gap: 0;
}

.project-row-actions {
  position: absolute;
  z-index: 3;
  top: 34px;
  right: 10px;
}

.project-row-actions .project-disable-button {
  position: static;
  inset: auto;
}

@media (max-width: 480px) {
  .project-row-link {
    padding-left: 16px;
    padding-right: 58px;
  }

  .project-row-status {
    top: 10px;
    right: 14px;
  }

  .project-row-actions {
    top: 31px;
    right: 6px;
  }
}
</style>
