<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { Project, Workspace } from '@dev-dashboard/contracts';

import {
  createWorkspace,
  deleteWorkspace,
  fetchHealth,
  fetchProjects,
  fetchWorkspaces,
  scanWorkspace,
} from './api';

import ProjectCard from './components/ProjectCard.vue';

const projects = ref<Project[]>([]);
const workspaces = ref<Workspace[]>([]);

const selectedWorkspaceId = ref('');

const newWorkspaceName = ref('');
const newWorkspacePath = ref('');

const apiConnected = ref(false);
const loadingProjects = ref(true);
const scanningWorkspace = ref(false);
const creatingWorkspace = ref(false);
const deletingWorkspace = ref(false);

const errorMessage = ref('');
const successMessage = ref('');
const warningCount = ref(0);
const lastScannedPath = ref('');

const selectedWorkspace = computed(() =>
  workspaces.value.find(
    (workspace) => workspace.id === selectedWorkspaceId.value,
  ),
);

const railsProjects = computed(
  () =>
    projects.value.filter((project) => project.type === 'rails')
      .length,
);

const nodeProjects = computed(
  () =>
    projects.value.filter((project) => project.type === 'node')
      .length,
);

const gitProjects = computed(
  () =>
    projects.value.filter((project) =>
      project.capabilities.includes('git'),
    ).length,
);

const sortedProjects = computed(() =>
  [...projects.value].sort((left, right) =>
    left.name.localeCompare(right.name),
  ),
);

function clearMessages(): void {
  errorMessage.value = '';
  successMessage.value = '';
}

async function scanSelectedWorkspace(): Promise<void> {
  const workspace = selectedWorkspace.value;

  if (!workspace) {
    projects.value = [];
    lastScannedPath.value = '';
    return;
  }

  scanningWorkspace.value = true;
  loadingProjects.value = true;
  warningCount.value = 0;
  clearMessages();

  try {
    const result = await scanWorkspace(workspace.id);

    projects.value = result.projects;
    warningCount.value = result.warnings.length;
    lastScannedPath.value = result.workspacePath;
    apiConnected.value = true;

    successMessage.value = `${result.projects.length} projeto(s) detectado(s).`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível escanear o workspace.';
  } finally {
    scanningWorkspace.value = false;
    loadingProjects.value = false;
  }
}

async function loadInitialData(): Promise<void> {
  loadingProjects.value = true;
  clearMessages();

  try {
    const health = await fetchHealth();

    apiConnected.value = health.status === 'ok';

    const storedWorkspaces = await fetchWorkspaces();

    workspaces.value = storedWorkspaces;

    const firstWorkspace = storedWorkspaces[0];

    if (firstWorkspace) {
      selectedWorkspaceId.value = firstWorkspace.id;
      await scanSelectedWorkspace();
      return;
    }

    projects.value = await fetchProjects();
  } catch (error) {
    apiConnected.value = false;

    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o dashboard.';
  } finally {
    loadingProjects.value = false;
  }
}

async function handleWorkspaceSelection(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement;

  selectedWorkspaceId.value = target.value;

  await scanSelectedWorkspace();
}

async function handleCreateWorkspace(): Promise<void> {
  const name = newWorkspaceName.value.trim();
  const path = newWorkspacePath.value.trim();

  clearMessages();

  if (!name || !path) {
    errorMessage.value = 'Informe o nome e o caminho do workspace.';

    return;
  }

  creatingWorkspace.value = true;

  try {
    const workspace = await createWorkspace({
      name,
      path,
    });

    workspaces.value = [...workspaces.value, workspace].sort(
      (left, right) => left.name.localeCompare(right.name),
    );

    selectedWorkspaceId.value = workspace.id;

    newWorkspaceName.value = '';
    newWorkspacePath.value = '';

    successMessage.value = `Workspace "${workspace.name}" cadastrado.`;

    await scanSelectedWorkspace();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cadastrar o workspace.';
  } finally {
    creatingWorkspace.value = false;
  }
}

async function handleDeleteWorkspace(): Promise<void> {
  const workspace = selectedWorkspace.value;

  if (!workspace) {
    return;
  }

  const confirmed = window.confirm(
    `Remover o workspace "${workspace.name}" do dashboard? ` +
      'Os arquivos locais não serão apagados.',
  );

  if (!confirmed) {
    return;
  }

  deletingWorkspace.value = true;
  clearMessages();

  try {
    await deleteWorkspace(workspace.id);

    workspaces.value = workspaces.value.filter(
      (item) => item.id !== workspace.id,
    );

    projects.value = [];
    warningCount.value = 0;
    lastScannedPath.value = '';

    const nextWorkspace = workspaces.value[0];

    if (nextWorkspace) {
      selectedWorkspaceId.value = nextWorkspace.id;
      await scanSelectedWorkspace();
    } else {
      selectedWorkspaceId.value = '';
      successMessage.value = `Workspace "${workspace.name}" removido.`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover o workspace.';
  } finally {
    deletingWorkspace.value = false;
  }
}

onMounted(() => {
  void loadInitialData();
});
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">DD</div>

        <div>
          <strong>Dev Dashboard</strong>
          <span>Local workspace</span>
        </div>
      </div>

      <nav class="navigation" aria-label="Navegação principal">
        <a
          class="navigation-item navigation-item-active"
          href="#overview"
        >
          <span class="navigation-icon">⌂</span>
          Visão geral
        </a>

        <a class="navigation-item" href="#repositories">
          <span class="navigation-icon">◇</span>
          Repositórios
        </a>

        <a class="navigation-item" href="#processes">
          <span class="navigation-icon">▶</span>
          Processos
        </a>

        <a class="navigation-item" href="#jobs">
          <span class="navigation-icon">≡</span>
          Jobs e logs
        </a>
      </nav>

      <div class="sidebar-section">
        <span class="sidebar-label"> Workspace ativo </span>

        <div v-if="selectedWorkspace" class="workspace-summary">
          <span class="workspace-avatar">
            {{ selectedWorkspace.name.charAt(0).toUpperCase() }}
          </span>

          <div>
            <strong>
              {{ selectedWorkspace.name }}
            </strong>

            <span> {{ projects.length }} projetos </span>
          </div>
        </div>

        <div v-else class="workspace-summary-empty">
          Nenhum workspace
        </div>
      </div>

      <div class="sidebar-footer">
        <span
          class="connection-dot"
          :class="{
            'connection-dot-online': apiConnected,
          }"
        />

        <span>
          API
          {{ apiConnected ? 'conectada' : 'desconectada' }}
        </span>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <span class="eyebrow"> Ambiente local </span>

          <h1>Visão geral</h1>
        </div>

        <div class="topbar-actions">
          <button class="command-button" type="button" disabled>
            Buscar ou executar
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

      <section id="overview" class="content">
        <div class="hero-grid">
          <div class="hero-copy">
            <span class="section-kicker">
              Central de desenvolvimento
            </span>

            <h2>Seus projetos locais em um único lugar.</h2>

            <p>
              Cadastre múltiplos workspaces, detecte aplicações Rails
              e Node e prepare o ambiente para gerenciar processos,
              Git, testes e logs.
            </p>
          </div>

          <section class="workspace-panel">
            <div class="form-heading">
              <div>
                <span class="section-kicker"> Workspaces </span>

                <h3>Gerenciar projetos locais</h3>
              </div>

              <span class="local-badge"> Local only </span>
            </div>

            <template v-if="workspaces.length > 0">
              <label class="workspace-field">
                <span>Workspace ativo</span>

                <select
                  :value="selectedWorkspaceId"
                  :disabled="scanningWorkspace"
                  @change="handleWorkspaceSelection"
                >
                  <option
                    v-for="workspace in workspaces"
                    :key="workspace.id"
                    :value="workspace.id"
                  >
                    {{ workspace.name }}
                  </option>
                </select>
              </label>

              <code v-if="selectedWorkspace" class="workspace-path">
                {{ selectedWorkspace.path }}
              </code>

              <div class="workspace-actions">
                <button
                  class="primary-button"
                  type="button"
                  :disabled="scanningWorkspace"
                  @click="scanSelectedWorkspace"
                >
                  {{
                    scanningWorkspace
                      ? 'Escaneando...'
                      : 'Escanear novamente'
                  }}
                </button>

                <button
                  class="danger-button"
                  type="button"
                  :disabled="deletingWorkspace"
                  @click="handleDeleteWorkspace"
                >
                  {{ deletingWorkspace ? 'Removendo...' : 'Remover' }}
                </button>
              </div>

              <div class="workspace-divider">
                Adicionar outro workspace
              </div>
            </template>

            <div v-else class="workspace-empty">
              Nenhum workspace foi cadastrado.
            </div>

            <form
              class="workspace-create-form"
              @submit.prevent="handleCreateWorkspace"
            >
              <label class="workspace-field">
                <span>Nome</span>

                <input
                  v-model="newWorkspaceName"
                  autocomplete="off"
                  placeholder="Projetos pessoais"
                />
              </label>

              <label class="workspace-field">
                <span>Caminho local</span>

                <input
                  v-model="newWorkspacePath"
                  autocomplete="off"
                  placeholder="/home/usuario/projetos"
                />
              </label>

              <button
                class="secondary-primary-button"
                type="submit"
                :disabled="creatingWorkspace"
              >
                {{
                  creatingWorkspace
                    ? 'Cadastrando...'
                    : 'Adicionar workspace'
                }}
              </button>
            </form>
          </section>
        </div>

        <div
          v-if="errorMessage"
          class="alert alert-error"
          role="alert"
        >
          <strong>Não foi possível concluir a ação.</strong>
          <span>{{ errorMessage }}</span>
        </div>

        <div
          v-if="successMessage"
          class="alert alert-success"
          role="status"
        >
          <strong>Ação concluída.</strong>
          <span>{{ successMessage }}</span>
        </div>

        <div v-if="warningCount > 0" class="alert alert-warning">
          <strong>Scan concluído com avisos.</strong>

          <span>
            {{ warningCount }}
            diretório(s) não puderam ser analisados.
          </span>
        </div>

        <div v-if="lastScannedPath" class="scan-result">
          Workspace carregado:
          <code>{{ lastScannedPath }}</code>
        </div>

        <section
          class="metrics-grid"
          aria-label="Resumo dos projetos"
        >
          <article class="metric-card">
            <span class="metric-label"> Repositórios </span>

            <strong>{{ projects.length }}</strong>

            <span class="metric-detail"> projetos detectados </span>
          </article>

          <article class="metric-card">
            <span class="metric-label"> Rails </span>

            <strong>{{ railsProjects }}</strong>

            <span class="metric-detail"> aplicações Ruby </span>
          </article>

          <article class="metric-card">
            <span class="metric-label"> Node </span>

            <strong>{{ nodeProjects }}</strong>

            <span class="metric-detail"> aplicações JavaScript </span>
          </article>

          <article class="metric-card">
            <span class="metric-label"> Git </span>

            <strong>{{ gitProjects }}</strong>

            <span class="metric-detail">
              repositórios versionados
            </span>
          </article>
        </section>

        <section id="repositories" class="repositories-section">
          <div class="section-heading">
            <div>
              <span class="section-kicker"> Repositórios </span>

              <h2>Projetos detectados</h2>
            </div>

            <span class="section-count">
              {{ projects.length }}
              {{ projects.length === 1 ? 'projeto' : 'projetos' }}
            </span>
          </div>

          <div v-if="loadingProjects" class="empty-state">
            <div class="empty-icon">•••</div>
            <h3>Carregando projetos</h3>
            <p>Consultando a API local.</p>
          </div>

          <div
            v-else-if="sortedProjects.length === 0"
            class="empty-state"
          >
            <div class="empty-icon">◇</div>

            <h3>Nenhum projeto carregado</h3>

            <p>
              Cadastre ou selecione um workspace para detectar
              aplicações Rails e Node.
            </p>
          </div>

          <div v-else class="projects-grid">
            <ProjectCard
              v-for="project in sortedProjects"
              :key="project.id"
              :project="project"
            />
          </div>
        </section>
      </section>
    </main>
  </div>
</template>
