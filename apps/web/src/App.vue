<script setup lang="ts">
import {
  CodeBracketIcon,
  CircleStackIcon,
  CommandLineIcon,
  ComputerDesktopIcon,
  HomeIcon,
  PlusIcon,
  QueueListIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  defineAsyncComponent,
  onMounted,
  provide,
  ref,
  watch,
} from 'vue';
import { darkTheme, NConfigProvider } from 'naive-ui';
import { Toaster } from 'vue-sonner';

import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import { nativeNotificationStore } from './stores/native-notifications';
import CommandPalette from './components/CommandPalette.vue';
import VisualPreferences from './components/VisualPreferences.vue';
import WorkspaceManagerModal from './components/WorkspaceManagerModal.vue';
import { createNaiveThemeOverrides } from './utils/naive-theme';
import {
  currentTheme,
  loadVisualPreferences,
} from './utils/visual-preferences';
import {
  readSidebarCollapsed,
  storeSidebarCollapsed,
} from './utils/sidebar-preferences';
const naiveTheme = computed(() =>
  currentTheme.value === 'dark' ? darkTheme : null,
);
const naiveThemeOverrides = computed(() =>
  createNaiveThemeOverrides(currentTheme.value),
);

loadVisualPreferences();

type InterfaceMode = 'web' | 'terminal';

const DashboardTerminalMode = defineAsyncComponent(
  () => import('./components/DashboardTerminalMode.vue'),
);

const workspaceManagerOpen = ref(false);
const interfaceMode = ref<InterfaceMode>('web');
const terminalMounted = ref(false);
const projectSidebarCollapsed = ref(readSidebarCollapsed());
provide('projectSidebarCollapsed', projectSidebarCollapsed);

const route = useRoute();
const router = useRouter();

const isProjectRoute = computed(
  () =>
    typeof route.name === 'string' &&
    (route.name === 'project-details' || route.name.startsWith('project-')),
);
const showProjectChrome = computed(
  () => isProjectRoute.value && interfaceMode.value === 'web',
);

nativeNotificationStore.setNavigator((target) => {
  void router.push(target);
});

const { knownProjects, workspaces, selectedWorkspaceId, switchWorkspace } =
  dashboardStore;

function openWorkspaceManager(): void {
  workspaceManagerOpen.value = true;
}

function handleWorkspaceSwitch(event: Event): void {
  const target = event.target as HTMLSelectElement;
  void switchWorkspace(target.value);
}

function setInterfaceMode(mode: InterfaceMode): void {
  if (mode === 'terminal') terminalMounted.value = true;
  interfaceMode.value = mode;
}

function toggleProjectSidebar(): void {
  if (!showProjectChrome.value) return;
  projectSidebarCollapsed.value = !projectSidebarCollapsed.value;
}

watch(projectSidebarCollapsed, (collapsed) => {
  storeSidebarCollapsed(collapsed);
});

onMounted(() => {
  void dashboardStore.ensureDashboardLoaded();
});
</script>

<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="naiveThemeOverrides">
    <div
      class="app-shell app-shell-topnav"
      :class="{
        'app-shell-project-sidebar': showProjectChrome,
        'app-shell-project-sidebar-collapsed':
          showProjectChrome && projectSidebarCollapsed,
        'app-shell-terminal-mode': interfaceMode === 'terminal',
      }"
    >
      <button
        v-if="showProjectChrome"
        class="brand project-sidebar-brand"
        type="button"
        :aria-label="
          projectSidebarCollapsed
            ? 'Expandir sidebar do projeto'
            : 'Recolher sidebar do projeto'
        "
        :aria-pressed="projectSidebarCollapsed"
        :title="
          projectSidebarCollapsed
            ? 'Expandir sidebar do projeto'
            : 'Recolher sidebar do projeto'
        "
        @click="toggleProjectSidebar"
      >
        <div class="brand-mark" aria-hidden="true">
          <CodeBracketIcon />
        </div>

        <div class="brand-copy">
          <strong>Dev Dashboard</strong>
          <span>Local workspace</span>
        </div>
      </button>

      <header id="primary-navigation" class="sidebar topbar">
        <div class="sidebar-section topbar-workspace">
          <span class="sidebar-label">Workspace ativo</span>
          <div class="sidebar-workspace-row">
            <select
              v-if="workspaces.length > 0"
              class="sidebar-workspace-select"
              :value="selectedWorkspaceId"
              aria-label="Trocar workspace ativo"
              @change="handleWorkspaceSwitch"
            >
              <option
                v-for="workspace in workspaces"
                :key="workspace.id"
                :value="workspace.id"
              >
                {{ workspace.name }}
              </option>
            </select>

            <div v-else class="workspace-summary-empty">Nenhum workspace</div>

            <button
              type="button"
              class="sidebar-workspace-add-icon"
              aria-label="Adicionar workspace"
              aria-haspopup="dialog"
              @click.stop="openWorkspaceManager"
            >
              <PlusIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav
          class="navigation topbar-navigation"
          aria-label="Navegação principal"
        >
          <span class="sidebar-label navigation-label">Navegação</span>

          <RouterLink
            class="navigation-item"
            :class="{ 'navigation-item-active': route.name === 'dashboard' }"
            :to="{ name: 'dashboard' }"
          >
            <HomeIcon class="navigation-icon" aria-hidden="true" />
            <span class="navigation-text">Visão geral</span>
          </RouterLink>

          <RouterLink
            class="navigation-item"
            :class="{ 'navigation-item-active': route.name === 'activity' }"
            :to="{ name: 'activity' }"
          >
            <QueueListIcon class="navigation-icon" aria-hidden="true" />
            <span class="navigation-text">Atividade</span>
          </RouterLink>

          <RouterLink
            class="navigation-item"
            :class="{ 'navigation-item-active': route.name === 'database' }"
            :to="{ name: 'database' }"
          >
            <CircleStackIcon class="navigation-icon" aria-hidden="true" />
            <span class="navigation-text">Banco de dados</span>
          </RouterLink>
        </nav>

        <div
          class="interface-mode-toggle"
          role="group"
          aria-label="Modo de interface"
        >
          <button
            type="button"
            :class="{ 'is-active': interfaceMode === 'web' }"
            :aria-pressed="interfaceMode === 'web'"
            @click="setInterfaceMode('web')"
          >
            <ComputerDesktopIcon aria-hidden="true" />
            <span>Web</span>
          </button>
          <button
            type="button"
            :class="{ 'is-active': interfaceMode === 'terminal' }"
            :aria-pressed="interfaceMode === 'terminal'"
            @click="setInterfaceMode('terminal')"
          >
            <CommandLineIcon aria-hidden="true" />
            <span>Terminal</span>
          </button>
        </div>

        <div class="sidebar-tools topbar-tools">
          <VisualPreferences />
        </div>
      </header>

      <main class="main-content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" v-show="interfaceMode === 'web'" />
        </RouterView>

        <DashboardTerminalMode
          v-if="terminalMounted"
          v-show="interfaceMode === 'terminal'"
          :active="interfaceMode === 'terminal'"
        />
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
