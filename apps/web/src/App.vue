<script setup lang="ts">
import {
  Bars3Icon,
  Cog6ToothIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  PlayCircleIcon,
  PlusIcon,
  QueueListIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue';

import {
  RouterLink,
  RouterView,
  useRoute,
  useRouter,
} from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import { nativeNotificationStore } from './stores/native-notifications';
import VisualPreferences from './components/VisualPreferences.vue';
import CommandPalette from './components/CommandPalette.vue';
import NoticeCenter from './components/NoticeCenter.vue';
import WorkspaceManagerModal from './components/WorkspaceManagerModal.vue';

const commandPalette = ref<InstanceType<typeof CommandPalette>>();
const workspaceManagerOpen = ref(false);
const sidebarOpen = ref(false);

const route = useRoute();
const router = useRouter();

nativeNotificationStore.setNavigator((target) => {
  void router.push(target);
});

const {
  apiConnected,
  workspaces,
  selectedWorkspaceId,
  switchWorkspace,
} = dashboardStore;

function handleWorkspaceSwitch(event: Event): void {
  const target = event.target as HTMLSelectElement;
  void switchWorkspace(target.value);
}

watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false;
  },
);

const pageTitle = computed(() =>
  typeof route.meta.title === 'string'
    ? route.meta.title
    : 'Dev Dashboard',
);

const pageEyebrow = computed(() =>
  typeof route.meta.eyebrow === 'string'
    ? route.meta.eyebrow
    : 'Ambiente local',
);

onMounted(() => {
  void dashboardStore.ensureDashboardLoaded();
});
</script>

<template>
  <div class="app-shell">
    <button
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="Fechar navegação"
      @click="sidebarOpen = false"
    />

    <aside
      id="primary-sidebar"
      class="sidebar"
      :class="{ 'sidebar-open': sidebarOpen }"
    >
      <RouterLink class="brand brand-link" to="/">
        <div class="brand-mark">DD</div>

        <div>
          <strong>Dev Dashboard</strong>
          <span>Local workspace</span>
        </div>
      </RouterLink>

      <button
        class="sidebar-close-button"
        type="button"
        aria-label="Fechar navegação"
        @click="sidebarOpen = false"
      >
        <XMarkIcon aria-hidden="true" />
      </button>

      <div class="sidebar-section">
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

          <div v-else class="workspace-summary-empty">
            Nenhum workspace
          </div>

          <button
            type="button"
            class="sidebar-workspace-add-icon"
            aria-label="Adicionar workspace"
            @click="workspaceManagerOpen = true"
          >
            <PlusIcon aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav class="navigation" aria-label="Navegação principal">
        <span class="sidebar-label navigation-label">Navegação</span>

        <RouterLink
          class="navigation-item"
          :class="{ 'navigation-item-active': route.name === 'dashboard' }"
          :to="{ name: 'dashboard' }"
        >
          <HomeIcon class="navigation-icon" aria-hidden="true" />
          Visão geral
        </RouterLink>

        <RouterLink
          class="navigation-item"
          :class="{ 'navigation-item-active': route.name === 'processes' }"
          :to="{ name: 'processes' }"
        >
          <PlayCircleIcon class="navigation-icon" aria-hidden="true" />
          Processos
        </RouterLink>

        <RouterLink
          class="navigation-item"
          :class="{ 'navigation-item-active': route.name === 'activity' }"
          :to="{ name: 'activity' }"
        >
          <QueueListIcon class="navigation-icon" aria-hidden="true" />
          Atividade
        </RouterLink>

        <RouterLink class="navigation-item" :class="{ 'navigation-item-active': route.name === 'settings' }" :to="{ name: 'settings' }">
          <Cog6ToothIcon class="navigation-icon" aria-hidden="true" />
          Configurações
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <span class="connection-dot" :class="{ 'connection-dot-online': apiConnected }" />
        <span>
          <strong>API {{ apiConnected ? 'conectada' : 'desconectada' }}</strong>
          <small>Ambiente local</small>
        </span>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <button
          class="topbar-menu-button"
          type="button"
          aria-label="Abrir navegação"
          aria-controls="primary-sidebar"
          :aria-expanded="sidebarOpen"
          @click="sidebarOpen = true"
        >
          <Bars3Icon aria-hidden="true" />
        </button>

        <div class="topbar-heading">
          <span class="eyebrow">{{ pageEyebrow }}</span>
          <h1>{{ pageTitle }}</h1>
        </div>

        <div class="topbar-actions">
          <NoticeCenter />

          <VisualPreferences />

          <button class="command-button" type="button" @click="commandPalette?.show()">
            <MagnifyingGlassIcon aria-hidden="true" />
            <span>Navegação rápida</span>
            <kbd>⌘ K</kbd>
          </button>

          <span class="topbar-divider" aria-hidden="true" />

          <div
            class="api-status"
            :class="{
              'api-status-online': apiConnected,
            }"
          >
            <span />
            {{ apiConnected ? 'Online' : 'Offline' }}
          </div>
        </div>
      </header>

      <RouterView />
    </main>

    <CommandPalette
      ref="commandPalette"
      :projects="dashboardStore.knownProjects.value"
      :workspaces="dashboardStore.workspaces.value"
    />

    <WorkspaceManagerModal
      :open="workspaceManagerOpen"
      @close="workspaceManagerOpen = false"
    />
  </div>
</template>
