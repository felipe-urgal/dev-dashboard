<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CheckBadgeIcon,
  ChevronDownIcon,
  CircleStackIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  CubeIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  FolderIcon,
  LockClosedIcon,
  PlayCircleIcon,
  QueueListIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';
import { RouterLink, useRoute } from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

const props = defineProps<{
  project: Project;
  sidebarCollapsed: boolean;
  sidekiqDetected: boolean;
  webpackDetected: boolean;
  environmentInstanceId?: string | undefined;
}>();

const emit = defineEmits<{
  'expand-sidebar': [];
}>();

const route = useRoute();

const gitSidebarTabs = [
  { id: 'sync', label: 'Sincronização' },
  { id: 'branches', label: 'Branches' },
  { id: 'diff', label: 'Diff' },
  { id: 'commit', label: 'Commit' },
  { id: 'undo', label: 'Desfazer' },
  { id: 'pull-request', label: 'Pull Request' },
  { id: 'history', label: 'Histórico' },
] as const;

type SidebarGroupId = 'server' | 'git' | 'development' | 'quality';

const expandedGroups = ref<Record<SidebarGroupId, boolean>>({
  server: false,
  git: false,
  development: false,
  quality: false,
});

const activeGitSidebarTab = computed(() => {
  const value = Array.isArray(route.query.tab)
    ? route.query.tab[0]
    : route.query.tab;
  return gitSidebarTabs.some((tab) => tab.id === value) ? value : 'sync';
});

function routeName(): string {
  return typeof route.name === 'string' ? route.name : '';
}

function groupForRoute(): SidebarGroupId | undefined {
  const name = routeName();

  if (
    [
      'project-details',
      'project-server',
      'project-terminal',
      'project-console',
      'project-rails-sidekiq',
      'project-rails-webpack',
    ].includes(name)
  ) {
    return 'server';
  }

  if (['project-git', 'project-worktrees'].includes(name)) {
    return 'git';
  }

  if (
    [
      'project-tests',
      'project-dependencies',
      'project-dev-container',
      'project-compose',
      'project-environment',
      'project-migrations',
    ].includes(name)
  ) {
    return 'development';
  }

  if (
    [
      'project-local-ci',
      'project-readiness',
      'project-security-center',
      'project-doctor',
    ].includes(name)
  ) {
    return 'quality';
  }

  return undefined;
}

function isGroupActive(group: SidebarGroupId): boolean {
  return groupForRoute() === group;
}

function toggleGroup(group: SidebarGroupId): void {
  if (props.sidebarCollapsed) {
    emit('expand-sidebar');
  }

  expandedGroups.value[group] = !expandedGroups.value[group];
}

function ensureActiveGroupOpen(): void {
  const activeGroup = groupForRoute();
  if (activeGroup) {
    expandedGroups.value[activeGroup] = true;
  }
}

watch(() => [route.name, route.query.tab] as const, ensureActiveGroupOpen, {
  immediate: true,
});

function environmentQuery() {
  return props.environmentInstanceId
    ? { environmentInstanceId: props.environmentInstanceId }
    : undefined;
}
</script>

<template>
  <div class="project-details-primary-tabs">
    <div class="project-sidebar-desktop-groups">
      <section class="project-details-menu-group">
        <button
          class="project-details-tab project-details-menu-trigger"
          :class="{ 'project-details-tab-active': isGroupActive('server') }"
          type="button"
          :aria-expanded="expandedGroups.server"
          aria-controls="project-sidebar-server-menu"
          :title="sidebarCollapsed ? 'Servidor' : undefined"
          @click="toggleGroup('server')"
        >
          <ServerStackIcon aria-hidden="true" />
          <span>Servidor</span>
          <ChevronDownIcon
            class="project-details-menu-chevron"
            aria-hidden="true"
          />
        </button>

        <nav
          v-show="expandedGroups.server && !sidebarCollapsed"
          id="project-sidebar-server-menu"
          class="project-details-submenu"
          aria-label="Ferramentas do servidor"
        >
          <RouterLink
            v-if="project.capabilities.includes('server')"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-server' ||
                route.name === 'project-details',
            }"
            :to="{
              name: 'project-server',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <ServerStackIcon aria-hidden="true" />
            <span>Servidor</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-terminal',
            }"
            :to="{
              name: 'project-terminal',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <CommandLineIcon aria-hidden="true" />
            <span>Terminal</span>
          </RouterLink>

          <RouterLink
            v-if="project.type === 'rails'"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-console',
            }"
            :to="{
              name: 'project-console',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <CommandLineIcon aria-hidden="true" />
            <span>Console Rails</span>
          </RouterLink>

          <RouterLink
            v-if="project.type === 'rails' && sidekiqDetected"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-rails-sidekiq',
            }"
            :to="{
              name: 'project-rails-sidekiq',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <QueueListIcon aria-hidden="true" />
            <span>Sidekiq</span>
          </RouterLink>

          <RouterLink
            v-if="project.type === 'rails' && webpackDetected"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-rails-webpack',
            }"
            :to="{
              name: 'project-rails-webpack',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <CodeBracketIcon aria-hidden="true" />
            <span>Webpack</span>
          </RouterLink>
        </nav>
      </section>

      <section class="project-details-menu-group">
        <button
          class="project-details-tab project-details-menu-trigger"
          :class="{ 'project-details-tab-active': isGroupActive('git') }"
          type="button"
          :aria-expanded="expandedGroups.git"
          aria-controls="project-sidebar-git-menu"
          :title="sidebarCollapsed ? 'Git' : undefined"
          @click="toggleGroup('git')"
        >
          <CodeBracketIcon aria-hidden="true" />
          <span>Git</span>
          <ChevronDownIcon
            class="project-details-menu-chevron"
            aria-hidden="true"
          />
        </button>

        <nav
          v-show="expandedGroups.git && !sidebarCollapsed"
          id="project-sidebar-git-menu"
          class="project-details-submenu"
          aria-label="Ferramentas do Git"
        >
          <RouterLink
            v-for="tab in gitSidebarTabs"
            :key="tab.id"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-git' && activeGitSidebarTab === tab.id,
            }"
            :to="{
              name: 'project-git',
              params: { projectId: project.id },
              query: { tab: tab.id },
            }"
          >
            <span>{{ tab.label }}</span>
          </RouterLink>

          <RouterLink
            v-if="project.capabilities.includes('git')"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-worktrees',
            }"
            :to="{
              name: 'project-worktrees',
              params: { projectId: project.id },
            }"
          >
            <FolderIcon aria-hidden="true" />
            <span>Worktrees</span>
          </RouterLink>
        </nav>
      </section>

      <section class="project-details-menu-group">
        <button
          class="project-details-tab project-details-menu-trigger"
          :class="{
            'project-details-tab-active': isGroupActive('development'),
          }"
          type="button"
          :aria-expanded="expandedGroups.development"
          aria-controls="project-sidebar-development-menu"
          :title="sidebarCollapsed ? 'Desenvolvimento' : undefined"
          @click="toggleGroup('development')"
        >
          <BeakerIcon aria-hidden="true" />
          <span>Desenvolvimento</span>
          <ChevronDownIcon
            class="project-details-menu-chevron"
            aria-hidden="true"
          />
        </button>

        <nav
          v-show="expandedGroups.development && !sidebarCollapsed"
          id="project-sidebar-development-menu"
          class="project-details-submenu"
          aria-label="Ferramentas de desenvolvimento"
        >
          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-tests',
            }"
            :to="{
              name: 'project-tests',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <BeakerIcon aria-hidden="true" />
            <span>Testes</span>
          </RouterLink>

          <RouterLink
            v-if="project.type === 'rails' || project.type === 'node'"
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-dependencies',
            }"
            :to="{
              name: 'project-dependencies',
              params: { projectId: project.id },
            }"
          >
            <CubeIcon aria-hidden="true" />
            <span>Dependências</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-dev-container',
            }"
            :to="{
              name: 'project-dev-container',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <CubeTransparentIcon aria-hidden="true" />
            <span>Dev Container</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-compose',
            }"
            :to="{
              name: 'project-compose',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <ServerStackIcon aria-hidden="true" />
            <span>Compose</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-environment',
            }"
            :to="{
              name: 'project-environment',
              params: { projectId: project.id },
            }"
          >
            <AdjustmentsHorizontalIcon aria-hidden="true" />
            <span>Variáveis de ambiente</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-migrations',
            }"
            :to="{
              name: 'project-migrations',
              params: { projectId: project.id },
              ...(environmentQuery() ? { query: environmentQuery() } : {}),
            }"
          >
            <CircleStackIcon aria-hidden="true" />
            <span>Migrations</span>
          </RouterLink>
        </nav>
      </section>

      <section class="project-details-menu-group">
        <button
          class="project-details-tab project-details-menu-trigger"
          :class="{ 'project-details-tab-active': isGroupActive('quality') }"
          type="button"
          :aria-expanded="expandedGroups.quality"
          aria-controls="project-sidebar-quality-menu"
          :title="sidebarCollapsed ? 'Qualidade' : undefined"
          @click="toggleGroup('quality')"
        >
          <CheckBadgeIcon aria-hidden="true" />
          <span>Qualidade</span>
          <ChevronDownIcon
            class="project-details-menu-chevron"
            aria-hidden="true"
          />
        </button>

        <nav
          v-show="expandedGroups.quality && !sidebarCollapsed"
          id="project-sidebar-quality-menu"
          class="project-details-submenu"
          aria-label="Ferramentas de qualidade"
        >
          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-local-ci',
            }"
            :to="{
              name: 'project-local-ci',
              params: { projectId: project.id },
            }"
          >
            <PlayCircleIcon aria-hidden="true" />
            <span>Local CI</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-readiness',
            }"
            :to="{
              name: 'project-readiness',
              params: { projectId: project.id },
            }"
          >
            <CheckBadgeIcon aria-hidden="true" />
            <span>Readiness</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-security-center',
            }"
            :to="{
              name: 'project-security-center',
              params: { projectId: project.id },
            }"
          >
            <LockClosedIcon aria-hidden="true" />
            <span>Segurança</span>
          </RouterLink>

          <RouterLink
            class="project-details-submenu-item"
            :class="{
              'project-details-submenu-item-active':
                route.name === 'project-doctor',
            }"
            :to="{ name: 'project-doctor', params: { projectId: project.id } }"
          >
            <ShieldCheckIcon aria-hidden="true" />
            <span>Diagnóstico</span>
          </RouterLink>
        </nav>
      </section>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-agent',
        }"
        :to="{
          name: 'project-agent',
          params: { projectId: project.id },
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
        :title="sidebarCollapsed ? 'Agente' : undefined"
      >
        <CpuChipIcon aria-hidden="true" />
        <span>Agente</span>
      </RouterLink>

      <RouterLink
        v-if="project.capabilities.includes('production')"
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-production',
        }"
        :to="{ name: 'project-production', params: { projectId: project.id } }"
        :title="sidebarCollapsed ? 'Produção' : undefined"
      >
        <RocketLaunchIcon aria-hidden="true" />
        <span>Produção</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-readme',
        }"
        :to="{ name: 'project-readme', params: { projectId: project.id } }"
        :title="sidebarCollapsed ? 'README' : undefined"
      >
        <DocumentTextIcon aria-hidden="true" />
        <span>README</span>
      </RouterLink>
    </div>

    <div class="project-sidebar-mobile-links">
      <RouterLink
        v-if="project.capabilities.includes('server')"
        class="project-details-tab"
        :class="{
          'project-details-tab-active':
            route.name === 'project-server' || route.name === 'project-details',
        }"
        :to="{
          name: 'project-server',
          params: { projectId: project.id },
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
      >
        <ServerStackIcon aria-hidden="true" />
        <span>Servidor</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{ 'project-details-tab-active': route.name === 'project-git' }"
        :to="{ name: 'project-git', params: { projectId: project.id } }"
      >
        <CodeBracketIcon aria-hidden="true" />
        <span>Git</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-tests',
        }"
        :to="{
          name: 'project-tests',
          params: { projectId: project.id },
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
      >
        <BeakerIcon aria-hidden="true" />
        <span>Testes</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-agent',
        }"
        :to="{
          name: 'project-agent',
          params: { projectId: project.id },
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
      >
        <CpuChipIcon aria-hidden="true" />
        <span>Agente</span>
      </RouterLink>

      <RouterLink
        v-if="project.capabilities.includes('production')"
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-production',
        }"
        :to="{ name: 'project-production', params: { projectId: project.id } }"
      >
        <RocketLaunchIcon aria-hidden="true" />
        <span>Produção</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-terminal',
        }"
        :to="{
          name: 'project-terminal',
          params: { projectId: project.id },
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
      >
        <CommandLineIcon aria-hidden="true" />
        <span>Terminal</span>
      </RouterLink>

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
        :to="{
          name: 'project-dependencies',
          params: { projectId: project.id },
        }"
      >
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
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
      >
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
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
      >
        <ServerStackIcon aria-hidden="true" />
        <span>Compose</span>
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
        :to="{
          name: 'project-migrations',
          params: { projectId: project.id },
          ...(environmentQuery() ? { query: environmentQuery() } : {}),
        }"
      >
        <CircleStackIcon aria-hidden="true" />
        <span>Migrations</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-local-ci',
        }"
        :to="{ name: 'project-local-ci', params: { projectId: project.id } }"
      >
        <PlayCircleIcon aria-hidden="true" />
        <span>Local CI</span>
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
          'project-details-tab-active':
            route.name === 'project-security-center',
        }"
        :to="{
          name: 'project-security-center',
          params: { projectId: project.id },
        }"
      >
        <LockClosedIcon aria-hidden="true" />
        <span>Segurança</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-doctor',
        }"
        :to="{ name: 'project-doctor', params: { projectId: project.id } }"
      >
        <ShieldCheckIcon aria-hidden="true" />
        <span>Diagnóstico</span>
      </RouterLink>

      <RouterLink
        class="project-details-tab"
        :class="{
          'project-details-tab-active': route.name === 'project-readme',
        }"
        :to="{ name: 'project-readme', params: { projectId: project.id } }"
      >
        <DocumentTextIcon aria-hidden="true" />
        <span>README</span>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.project-sidebar-desktop-groups {
  display: contents;
}

.project-sidebar-mobile-links {
  display: none;
}

.project-details-menu-group {
  display: grid;
  gap: 2px;
}

.project-details-menu-trigger {
  cursor: pointer;
}

.project-details-menu-chevron {
  width: 14px !important;
  height: 14px !important;
  margin-left: auto;
  transition: transform 150ms ease;
}

.project-details-menu-trigger[aria-expanded='true']
  .project-details-menu-chevron {
  transform: rotate(180deg);
}

.project-details-submenu {
  display: grid;
  gap: 2px;
  margin: 2px 0 5px 22px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}

.project-details-submenu-item {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border-radius: 7px;
  color: var(--text-dim);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  line-height: 1.2;
  text-decoration: none;
}

.project-details-submenu-item svg {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.project-details-submenu-item:hover {
  color: var(--text);
  background: var(--surface-2);
}

.project-details-submenu-item-active {
  color: var(--accent);
  background: var(--accent-soft);
}

@media (min-width: 901px) and (max-height: 860px) {
  .project-details-submenu {
    gap: 1px;
    margin-left: 20px;
    padding-left: 8px;
  }

  .project-details-submenu-item {
    min-height: 26px;
    padding-inline: 8px;
    font-size: 9px;
  }
}

@media (max-width: 900px) {
  .project-sidebar-desktop-groups {
    display: none;
  }

  .project-sidebar-mobile-links {
    display: contents;
  }
}
</style>
