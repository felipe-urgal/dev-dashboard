<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';
import ProjectAvatar from './ProjectAvatar.vue';

import {
  capabilityLabel,
  projectTypeLabels,
} from '../utils/project-labels';

const props = defineProps<{
  project: Project;
}>();

const { managedProcess, supportsServer, isRunning } =
  useProjectProcessStatus(() => props.project);

const statusDotClass = computed(() => {
  if (!supportsServer.value) {
    return 'project-status-dot-neutral';
  }

  return isRunning.value
    ? 'project-status-dot-running'
    : 'project-status-dot-stopped';
});
</script>

<template>
  <li class="project-row">
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
      <ProjectAvatar :project="project" />

      <div class="project-row-identity">
        <div class="project-row-heading">
          <div class="project-row-title">
            <span
              class="project-status-dot"
              :class="statusDotClass"
              aria-hidden="true"
            />
            <h3>{{ project.name }}</h3>
          </div>

          <span
            class="type-badge"
            :class="`type-badge-${project.type}`"
          >
            {{ projectTypeLabels[project.type] }}
          </span>
        </div>

        <code class="project-path">{{ project.path }}</code>

        <div class="project-row-meta">
          <span
            v-for="capability in project.capabilities"
            :key="capability"
            class="capability"
          >
            {{ capabilityLabel(capability) }}
          </span>

          <span v-if="managedProcess?.port">
            Porta {{ managedProcess.port }}
          </span>
        </div>
      </div>

      <span class="project-row-arrow" aria-hidden="true">→</span>
    </RouterLink>
  </li>
</template>
