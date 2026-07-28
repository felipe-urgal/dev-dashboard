<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
} from 'vue';

import {
  RouterLink,
  RouterView,
  useRoute,
} from 'vue-router';

import { dashboardStore } from './stores/dashboard';
import VisualPreferences from './components/VisualPreferences.vue';
import CommandPalette from './components/CommandPalette.vue';
import WorkspaceManagerModal from './components/WorkspaceManagerModal.vue';

const commandPalette = ref<InstanceType<typeof CommandPalette>>();
const workspaceManagerOpen = ref(false);

const route = useRoute();

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
    <aside class="sidebar">
      <RouterLink class="brand brand-link" to="/">
        <div class="brand-mark">DD</div>

        <div>
          <strong>Dev Dashboard</strong>
          <span>Local workspace</span>
        </div>
      </RouterLink>

      <div class="sidebar-section">
        <div class="sidebar-section-heading">
          <span class="sidebar-label"> Workspace ativo </span>

          <button
            type="button"
            class="sidebar-workspace-add-icon"
            aria-label="Adicionar workspace"
            @click="workspaceManagerOpen = true"
          >
            +
          </button>
        </div>

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
      </div>

      <nav class="navigation" aria-label="Navegação principal">
        <RouterLink
          class="navigation-item"
          :class="{ 'navigation-item-active': route.name === 'processes' }"
          :to="{ name: 'processes' }"
        >
          <span class="navigation-icon">▶</span>
          Processos
        </RouterLink>

        <RouterLink
          class="navigation-item"
          :class="{ 'navigation-item-active': route.name === 'activity' }"
          :to="{ name: 'activity' }"
        >
          <span class="navigation-icon">≡</span>
          Atividade
        </RouterLink>

        <RouterLink class="navigation-item" :class="{ 'navigation-item-active': route.name === 'settings' }" :to="{ name: 'settings' }">
          <span class="navigation-icon">⚙</span>
          Configurações
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <span
          class="connection-dot"
          :class="{
            'connection-dot-online': apiConnected,
          }"
        />

        <span>
          API {{ apiConnected ? 'conectada' : 'desconectada' }}
        </span>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <span class="eyebrow">{{ pageEyebrow }}</span>
          <h1>{{ pageTitle }}</h1>
        </div>

        <div class="topbar-actions">
          <VisualPreferences />

          <button class="command-button" type="button" @click="commandPalette?.show()">
            Navegação rápida
            <kbd>⌘ K</kbd>
          </button>

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
