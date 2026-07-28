<script setup lang="ts">
import { RouterLink } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import ProjectAvatar from './ProjectAvatar.vue';
import ProjectServerPanel from './ProjectServerPanel.vue';

import {
  capabilityLabel,
  projectTypeLabels,
} from '../utils/project-labels';

const props = defineProps<{
  project: Project;
}>();
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
          <h3>{{ project.name }}</h3>
          <span
            class="type-badge"
            :class="`type-badge-${project.type}`"
          >
            {{ projectTypeLabels[project.type] }}
          </span>
          <span class="project-row-source">{{ project.source }}</span>
        </div>

        <code class="project-path">{{ project.path }}</code>

        <div class="capabilities">
          <span
            v-for="capability in project.capabilities"
            :key="capability"
            class="capability"
          >
            {{ capabilityLabel(capability) }}
          </span>
        </div>
      </div>

      <ProjectServerPanel
        :project="props.project"
        mode="compact"
        :show-actions="false"
      />

      <span class="project-row-arrow" aria-hidden="true">→</span>
    </RouterLink>
  </li>
</template>
