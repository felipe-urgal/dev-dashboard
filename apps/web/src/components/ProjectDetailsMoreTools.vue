<script setup lang="ts">
import {
  AdjustmentsHorizontalIcon,
  CheckBadgeIcon,
  CircleStackIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CubeIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  FolderIcon,
  LockClosedIcon,
  PlayCircleIcon,
  QueueListIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';

import { useRoute } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

defineProps<{
  project: Project;
  sidebarCollapsed: boolean;
  sidekiqDetected: boolean;
  webpackDetected: boolean;
  environmentInstanceId?: string | undefined;
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

    aria-label="Worktrees"
    :title="sidebarCollapsed ? 'Worktrees' : undefined"  >
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

    aria-label="Dependências"
    :title="sidebarCollapsed ? 'Dependências' : undefined"  >
    <CubeIcon aria-hidden="true" />
    <span>Dependências</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-dev-container',
    }"
    :to="{
      name: 'project-dev-container',
      params: { projectId: project.id },
      ...(environmentInstanceId ? { query: { environmentInstanceId } } : {}),
    }"

    aria-label="Dev Container"
    :title="sidebarCollapsed ? 'Dev Container' : undefined"  >
    <CubeTransparentIcon aria-hidden="true" />
    <span>Dev Container</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-compose',
    }"
    :to="{
      name: 'project-compose',
      params: { projectId: project.id },
      ...(environmentInstanceId ? { query: { environmentInstanceId } } : {}),
    }"

    aria-label="Compose"
    :title="sidebarCollapsed ? 'Compose' : undefined"  >
    <ServerStackIcon aria-hidden="true" />
    <span>Compose</span>
  </RouterLink>
  <RouterLink
    v-if="project.type === 'rails'"
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-console',
    }"
    :to="{
      name: 'project-console',
      params: { projectId: project.id },
      ...(environmentInstanceId ? { query: { environmentInstanceId } } : {}),
    }"

    aria-label="Console"
    :title="sidebarCollapsed ? 'Console' : undefined"  >
    <CommandLineIcon aria-hidden="true" />
    <span>Console</span>
  </RouterLink>
  <RouterLink
    v-if="project.type === 'rails' && sidekiqDetected"
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-rails-sidekiq',
    }"
    :to="{
      name: 'project-rails-sidekiq',
      params: { projectId: project.id },
      ...(environmentInstanceId ? { query: { environmentInstanceId } } : {}),
    }"

    aria-label="Sidekiq"
    :title="sidebarCollapsed ? 'Sidekiq' : undefined"  >
    <QueueListIcon aria-hidden="true" />
    <span>Sidekiq</span>
  </RouterLink>
  <RouterLink
    v-if="project.type === 'rails' && webpackDetected"
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-rails-webpack',
    }"
    :to="{
      name: 'project-rails-webpack',
      params: { projectId: project.id },
      ...(environmentInstanceId ? { query: { environmentInstanceId } } : {}),
    }"

    aria-label="Webpack"
    :title="sidebarCollapsed ? 'Webpack' : undefined"  >
    <CodeBracketIcon aria-hidden="true" />
    <span>Webpack</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-environment',
    }"
    :to="{ name: 'project-environment', params: { projectId: project.id } }"

    aria-label="Variáveis de ambiente"
    :title="sidebarCollapsed ? 'Variáveis de ambiente' : undefined"  >
    <AdjustmentsHorizontalIcon aria-hidden="true" />
    <span>Variáveis de ambiente</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-migrations',
    }"
    :to="{
      name: 'project-migrations',
      params: { projectId: project.id },
      ...(environmentInstanceId ? { query: { environmentInstanceId } } : {}),
    }"

    aria-label="Migrations"
    :title="sidebarCollapsed ? 'Migrations' : undefined"  >
    <CircleStackIcon aria-hidden="true" />
    <span>Migrations</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-local-ci',
    }"
    :to="{ name: 'project-local-ci', params: { projectId: project.id } }"

    aria-label="Local CI"
    :title="sidebarCollapsed ? 'Local CI' : undefined"  >
    <PlayCircleIcon aria-hidden="true" />
    <span>Local CI</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-readiness',
    }"
    :to="{ name: 'project-readiness', params: { projectId: project.id } }"

    aria-label="Readiness"
    :title="sidebarCollapsed ? 'Readiness' : undefined"  >
    <CheckBadgeIcon aria-hidden="true" />
    <span>Readiness</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{
      'project-details-tab-active': route.name === 'project-security-center',
    }"
    :to="{ name: 'project-security-center', params: { projectId: project.id } }"

    aria-label="Segurança"
    :title="sidebarCollapsed ? 'Segurança' : undefined"  >
    <LockClosedIcon aria-hidden="true" />
    <span>Segurança</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{ 'project-details-tab-active': route.name === 'project-doctor' }"
    :to="{ name: 'project-doctor', params: { projectId: project.id } }"

    aria-label="Diagnóstico"
    :title="sidebarCollapsed ? 'Diagnóstico' : undefined"  >
    <ShieldCheckIcon aria-hidden="true" />
    <span>Diagnóstico</span>
  </RouterLink>
  <RouterLink
    class="project-details-tab"
    :class="{ 'project-details-tab-active': route.name === 'project-readme' }"
    :to="{ name: 'project-readme', params: { projectId: project.id } }"

    aria-label="README"
    :title="sidebarCollapsed ? 'README' : undefined"  >
    <DocumentTextIcon aria-hidden="true" />
    <span>README</span>
  </RouterLink>
</template>
