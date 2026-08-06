<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowRightIcon, StarIcon } from '@heroicons/vue/24/outline';
import { StarIcon as SolidStarIcon } from '@heroicons/vue/24/solid';

import type { Project } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';

import { projectTypeLabels } from '../utils/project-labels';

const props = defineProps<{
  project: Project;
  favoriteUpdating?: boolean;
  recent?: boolean;
}>();

const emit = defineEmits<{
  'toggle-favorite': [project: Project];
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

const statusDotClass = computed(() => {
  if (!supportsServer.value) {
    return 'project-status-dot-neutral';
  }

  return isRunning.value
    ? 'project-status-dot-running'
    : 'project-status-dot-stopped';
});

const statusLabel = computed(() => {
  if (!supportsServer.value) {
    return 'Sem servidor';
  }

  return isRunning.value ? 'Em execução' : 'Parado';
});

const recentAccessTitle = computed(() => {
  if (!props.project.lastAccessedAt) return '';
  const date = new Date(props.project.lastAccessedAt);
  return Number.isNaN(date.getTime())
    ? 'Acessado recentemente'
    : `Último acesso: ${new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)}`;
});
</script>

<template>
  <li class="project-row">
    <button
      type="button"
      class="project-favorite-button"
      :class="{ active: project.favorite }"
      :aria-label="
        project.favorite
          ? `Remover ${project.name} dos favoritos`
          : `Adicionar ${project.name} aos favoritos`
      "
      :aria-pressed="project.favorite"
      :disabled="favoriteUpdating"
      @click="emit('toggle-favorite', project)"
    >
      <SolidStarIcon v-if="project.favorite" aria-hidden="true" />
      <StarIcon v-else aria-hidden="true" />
    </button>

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
              v-if="recent"
              class="project-recent-badge"
              :title="recentAccessTitle"
              aria-label="Acessado recentemente"
            >
              Recente
            </span>

            <span class="project-status">
              <span
                class="project-status-dot"
                :class="statusDotClass"
                aria-hidden="true"
              />
              {{ statusLabel }}
            </span>

            <span class="type-badge" :class="`type-badge-${project.type}`">
              {{ projectTypeLabels[project.type] }}
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

      <span class="project-row-action" aria-hidden="true">
        <span>Abrir</span>
        <ArrowRightIcon />
      </span>
    </RouterLink>
  </li>
</template>
