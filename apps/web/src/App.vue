<script setup lang="ts">
import { CircleStackIcon, HomeIcon } from '@heroicons/vue/24/outline';
import { computed, onMounted, provide, ref } from 'vue';
import { darkTheme, NConfigProvider } from 'naive-ui';
import { Toaster } from 'vue-sonner';

import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import { nativeNotificationStore } from './stores/native-notifications';
import CommandPalette from './components/CommandPalette.vue';
import VisualPreferences from './components/VisualPreferences.vue';
import ProjectSwitcher from './components/ProjectSwitcher.vue';
import WorkspaceManagerModal from './components/WorkspaceManagerModal.vue';
import WorkspaceSwitcher from './components/WorkspaceSwitcher.vue';
import { createNaiveThemeOverrides } from './utils/naive-theme';
import { resolveProjectSwitchTarget } from './utils/project-switch';
import {
  currentTheme,
  loadVisualPreferences,
} from './utils/visual-preferences';
const naiveTheme = computed(() =>
  currentTheme.value === 'dark' ? darkTheme : null,
);
const naiveThemeOverrides = computed(() =>
  createNaiveThemeOverrides(currentTheme.value),
);

loadVisualPreferences();

const workspaceManagerOpen = ref(false);

const route = useRoute();
const router = useRouter();

const isProjectRoute = computed(
  () => typeof route.name === 'string' && route.name.startsWith('project-'),
);

nativeNotificationStore.setNavigator((target) => {
  void router.push(target);
});

const {
  knownProjects,
  sortedProjects,
  workspaces,
  selectedWorkspaceId,
  switchWorkspace,
  getCardProcess,
} = dashboardStore;

const currentProjectId = computed(() =>
  isProjectRoute.value ? String(route.params.projectId ?? '') : '',
);

// Dentro de um projeto, o seletor lista os projetos do workspace ativo.
const currentProject = computed(() =>
  sortedProjects.value.find((project) => project.id === currentProjectId.value),
);

const runningProjectIds = computed(
  () =>
    new Set(
      sortedProjects.value
        .filter((project) => {
          const status = getCardProcess(project.id)?.status;
          return status === 'running' || status === 'starting';
        })
        .map((project) => project.id),
    ),
);

function switchProject(projectId: string): void {
  const target = sortedProjects.value.find((item) => item.id === projectId);
  if (!target) return;
  void router.push(
    resolveProjectSwitchTarget(
      { routeName: String(route.name ?? ''), query: route.query },
      target,
    ),
  );
}

function openWorkspaceManager(): void {
  workspaceManagerOpen.value = true;
}
provide('openWorkspaceManager', openWorkspaceManager);

onMounted(() => {
  void dashboardStore.ensureDashboardLoaded();
});
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <div class="app-shell app-shell-topnav">
      <header id="primary-navigation" class="sidebar topbar">
        <RouterLink
          class="topbar-icon-link topbar-nav-link"
          :class="{ 'is-active': route.name === 'dashboard' }"
          :to="{ name: 'dashboard' }"
          aria-label="Visão geral"
          title="Visão geral"
        >
          <HomeIcon aria-hidden="true" />
        </RouterLink>

        <div class="sidebar-section topbar-workspace">
          <span class="sidebar-label">Workspace ativo</span>
          <ProjectSwitcher
            v-if="currentProject"
            :projects="sortedProjects"
            :current-id="currentProject.id"
            :workspaces="workspaces"
            :selected-workspace-id="selectedWorkspaceId"
            :running-ids="runningProjectIds"
            @select="switchProject"
            @home="router.push({ name: 'dashboard' })"
            @select-workspace="
              (id) => {
                switchWorkspace(id);
                void router.push({ name: 'dashboard' });
              }
            "
            @add-workspace="openWorkspaceManager"
          />
          <WorkspaceSwitcher
            v-else
            :workspaces="workspaces"
            :selected-id="selectedWorkspaceId"
            @select="switchWorkspace"
            @add="openWorkspaceManager"
          />
        </div>

        <div id="topbar-project" class="topbar-project" />

        <div class="sidebar-tools topbar-tools">
          <div id="topbar-project-actions" class="topbar-project-actions" />
          <RouterLink
            v-if="!isProjectRoute"
            class="topbar-icon-link topbar-nav-link"
            :class="{ 'is-active': route.name === 'database' }"
            :to="{ name: 'database' }"
            aria-label="Banco de dados"
            title="Banco de dados"
          >
            <CircleStackIcon aria-hidden="true" />
          </RouterLink>
          <VisualPreferences />
        </div>
      </header>

      <main class="main-content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>

      <CommandPalette :projects="knownProjects" :workspaces="workspaces" />

      <WorkspaceManagerModal
        :open="workspaceManagerOpen"
        @close="workspaceManagerOpen = false"
      />

      <Toaster
        :theme="currentTheme"
        position="bottom-right"
        rich-colors
        close-button
        :duration="2500"
      />
    </div>
  </n-config-provider>
</template>

<style>
.topbar-icon-link {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  text-decoration: none;
  transition:
    color 160ms ease,
    background 160ms ease;
}

.topbar-icon-link:hover {
  color: var(--text);
  background: var(--surface-2);
}

.topbar-icon-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.topbar-icon-link.is-active {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.topbar-icon-link svg {
  width: 20px;
  height: 20px;
}
/* Toaster (vue-sonner) teleporta o conteúdo pra fora da árvore do App, então
   isso não pode ser scoped. Deixa os toasts translúcidos com um leve
   desfoque, no lugar do fundo sólido do preset rich-colors padrão. */
[data-sonner-toast] {
  background: color-mix(
    in srgb,
    var(--sonner-toast-bg, var(--normal-bg)) 78%,
    transparent
  ) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

[data-sonner-toast][data-type='success'] {
  --sonner-toast-bg: var(--success-bg);
}

[data-sonner-toast][data-type='error'] {
  --sonner-toast-bg: var(--error-bg);
}

[data-sonner-toast][data-type='warning'] {
  --sonner-toast-bg: var(--warning-bg);
}

[data-sonner-toast][data-type='info'] {
  --sonner-toast-bg: var(--info-bg);
}
</style>
