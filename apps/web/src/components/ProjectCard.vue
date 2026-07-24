<script setup lang="ts">
import { RouterLink } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import ProjectServerPanel from './ProjectServerPanel.vue';

import {
  capabilityLabel,
  projectInitials,
  projectTypeLabels,
} from '../utils/project-labels';

const props = defineProps<{
  project: Project;
}>();
</script>

<template>
  <article class="project-card">
    <div class="project-card-header">
      <div class="project-avatar">
        {{ projectInitials(project.name) }}
      </div>

      <div class="project-identity">
        <h3>{{ project.name }}</h3>
        <div class="project-meta">
          <span
            class="type-badge"
            :class="`type-badge-${project.type}`"
          >
            {{ projectTypeLabels[project.type] }}
          </span>
          <span>{{ project.source }}</span>
        </div>
      </div>
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

    <ProjectServerPanel :project="props.project" mode="compact" />

    <div class="project-card-footer">
      <span class="detected-status">
        <span />
        Detectado
      </span>

      <RouterLink
        class="secondary-button link-button"
        :to="{
          name: 'project-details',
          params: {
            projectId: project.id,
          },
        }"
      >
        Ver detalhes
      </RouterLink>
    </div>
  </article>
</template>
