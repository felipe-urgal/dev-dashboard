<script setup lang="ts">
import {
  AdjustmentsHorizontalIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CubeIcon,
  DocumentTextIcon,
  QueueListIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';

import { useRoute } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

defineProps<{
  project: Project;
  sidekiqDetected: boolean;
  webpackDetected: boolean;
}>();

const route = useRoute();
</script>

<template>
  <template>
    <RouterLink
      v-if="project.type === 'rails' || project.type === 'node'"
      class="project-details-tab"
      :class="{
        'project-details-tab-active': route.name === 'project-dependencies',
      }"
      :to="{ name: 'project-dependencies', params: { projectId: project.id } }"
    >
      <CubeIcon aria-hidden="true" />
      <span>Dependências</span>
    </RouterLink>
    <RouterLink
      v-if="project.type === 'rails'"
      class="project-details-tab"
      :class="{
        'project-details-tab-active': route.name === 'project-console',
      }"
      :to="{ name: 'project-console', params: { projectId: project.id } }"
    >
      <CommandLineIcon aria-hidden="true" />
      <span>Console</span>
    </RouterLink>
    <RouterLink
      v-if="project.type === 'rails' && sidekiqDetected"
      class="project-details-tab"
      :class="{
        'project-details-tab-active': route.name === 'project-rails-sidekiq',
      }"
      :to="{ name: 'project-rails-sidekiq', params: { projectId: project.id } }"
    >
      <QueueListIcon aria-hidden="true" />
      <span>Sidekiq</span>
    </RouterLink>
    <RouterLink
      v-if="project.type === 'rails' && webpackDetected"
      class="project-details-tab"
      :class="{
        'project-details-tab-active': route.name === 'project-rails-webpack',
      }"
      :to="{ name: 'project-rails-webpack', params: { projectId: project.id } }"
    >
      <CodeBracketIcon aria-hidden="true" />
      <span>Webpack</span>
    </RouterLink>
    <RouterLink
      class="project-details-tab"
      :class="{
        'project-details-tab-active': route.name === 'project-environment',
      }"
      :to="{ name: 'project-environment', params: { projectId: project.id } }"
    >
      <AdjustmentsHorizontalIcon aria-hidden="true" />
      <span>Variáveis de ambiente</span>
    </RouterLink>
    <RouterLink
      class="project-details-tab"
      :class="{ 'project-details-tab-active': route.name === 'project-doctor' }"
      :to="{ name: 'project-doctor', params: { projectId: project.id } }"
    >
      <ShieldCheckIcon aria-hidden="true" />
      <span>Diagnóstico</span>
    </RouterLink>
    <RouterLink
      class="project-details-tab"
      :class="{ 'project-details-tab-active': route.name === 'project-readme' }"
      :to="{ name: 'project-readme', params: { projectId: project.id } }"
    >
      <DocumentTextIcon aria-hidden="true" />
      <span>README</span>
    </RouterLink>
</template>
