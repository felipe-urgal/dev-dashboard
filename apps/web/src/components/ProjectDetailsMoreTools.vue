<script setup lang="ts">
import {
  AdjustmentsHorizontalIcon,
  CheckBadgeIcon,
  CircleStackIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CubeIcon,
  DocumentTextIcon,
  FolderIcon,
  LockClosedIcon,
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
  <RouterLink
    v-if="project.capabilities.includes('git')"
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-worktrees',
    }"
    :to="{ name: 'project-worktrees', params: { projectId: project.id } }"
  >
    <FolderIcon aria-hidden="true" />
    <span>Worktrees</span>
  </RouterLink>
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
    :class="{
      'project-details-tab-active': route.name === 'project-migrations',
    }"
    :to="{ name: 'project-migrations', params: { projectId: project.id } }"
  >
    <CircleStackIcon aria-hidden="true" />
    <span>Migrations</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-readiness',
    }"
    :to="{ name: 'project-readiness', params: { projectId: project.id } }"
  >
    <CheckBadgeIcon aria-hidden="true" />
    <span>Readiness</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-security-center',
    }"
    :to="{ name: 'project-security-center', params: { projectId: project.id } }"
  >
    <LockClosedIcon aria-hidden="true" />
    <span>Segurança</span>
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
