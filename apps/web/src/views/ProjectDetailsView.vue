<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  ref,
  watch,
  type Component,
} from 'vue';

import {
  BeakerIcon,
  CodeBracketIcon,
  CommandLineIcon,
  ServerStackIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';

import { RouterLink, useRoute } from 'vue-router';

import type { Project, ProjectGitOverview } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import ProjectDetailsMoreTools from '../components/ProjectDetailsMoreTools.vue';
import ProjectProcessesMenu from '../components/ProjectProcessesMenu.vue';
import ProjectPullRequestSummary from '../components/ProjectPullRequestSummary.vue';
import ProjectToolError from '../components/ProjectToolError.vue';
import ProjectToolLoading from '../components/ProjectToolLoading.vue';
import { dashboardStore } from '../stores/dashboard';
import { recordProjectVisit } from '../stores/project-recents';

function lazyTool(loader: () => Promise<{ default: Component }>): Component {
  return defineAsyncComponent({
    loader,
    loadingComponent: ProjectToolLoading,
    errorComponent: ProjectToolError,
    delay: 120,
    timeout: 15_000,
  });
}

const ProjectDatabasePanel = lazyTool(
  () => import('../components/ProjectDatabasePanel.vue'),
);
const ProjectDependenciesPanel = lazyTool(
  () => import('../components/ProjectDependenciesPanel.vue'),
);
const ProjectDoctorPanel = lazyTool(
  () => import('../components/ProjectDoctorPanel.vue'),
);
const ProjectGitPanel = lazyTool(
  () => import('../components/ProjectGitPanel.vue'),
);
const ProjectRailsRuntimePanel = lazyTool(
  () => import('../components/ProjectRailsRuntimePanel.vue'),
);
const ProjectEnvironmentPanel = lazyTool(
  () => import('../components/ProjectEnvironmentPanel.vue'),
);
const ProjectReadmePanel = lazyTool(
  () => import('../components/ProjectReadmePanel.vue'),
);
const ProjectServerPanel = lazyTool(
  () => import('../components/ProjectServerPanel.vue'),
);
const ProjectTerminalPanel = lazyTool(
  () => import('../components/ProjectTerminalPanel.vue'),
);
const ProjectTestsPanel = lazyTool(
  () => import('../components/ProjectTestsPanel.vue'),
);

const route = useRoute();

const project = ref<Project | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const gitBranch = ref('');
const gitOverview = ref<ProjectGitOverview | null>(null);
/** Otimista: assume que há banco até a detecção confirmar o contrário, evitando a aba piscar para o caso comum. */
const databaseSupported = ref(true);
/** Otimista, mesmo motivo do banco: evita a aba do worker piscar antes da detecção confirmar. */
const sidekiqDetected = ref(true);
const webpackDetected = ref(true);

const projectId = computed(() => {
  const value = route.params.projectId;
  return Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
});

const isReadmeRoute = computed(() => route.name === 'project-readme');
const isDoctorRoute = computed(() => route.name === 'project-doctor');
const isServerRoute = computed(
  () => route.name === 'project-server' || route.name === 'project-details',
);
const isGitRoute = computed(() => route.name === 'project-git');
const isTestsRoute = computed(() => route.name === 'project-tests');
const isDatabaseRoute = computed(() => route.name === 'project-database');
const isDependenciesRoute = computed(
  () => route.name === 'project-dependencies',
);
const isRailsSidekiqRoute = computed(
  () => route.name === 'project-rails-sidekiq',
);
const isRailsWebpackRoute = computed(
  () => route.name === 'project-rails-webpack',
);
const isEnvironmentRoute = computed(() => route.name === 'project-environment');
const isTerminalRoute = computed(() => route.name === 'project-terminal');
const isConsoleRoute = computed(() => route.name === 'project-console');

let activeProjectLoad:
  { projectId: string; promise: Promise<void> } | undefined;

function updateGitOverview(git: ProjectGitOverview): void {
  gitBranch.value = git.branch ?? '';
  gitOverview.value = git;
}

async function loadProject(): Promise<void> {
  const requestedProjectId = projectId.value;
  if (activeProjectLoad?.projectId === requestedProjectId) {
    await activeProjectLoad.promise;
    return;
  }

  const promise = loadProjectData(requestedProjectId);
  activeProjectLoad = { projectId: requestedProjectId, promise };

  try {
    await promise;
  } finally {
    if (activeProjectLoad?.promise === promise) {
      activeProjectLoad = undefined;
    }
  }
}

async function loadProjectData(requestedProjectId: string): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  project.value = null;
  gitBranch.value = '';
  gitOverview.value = null;
  databaseSupported.value = true;
  sidekiqDetected.value = true;
  webpackDetected.value = true;

  try {
    const loadedProject =
      await dashboardStore.ensureProject(requestedProjectId);
    if (projectId.value !== requestedProjectId || !loadedProject) return;

    project.value = loadedProject;
    void recordProjectVisit(loadedProject.id);

    const gitPromise = loadedProject.capabilities.includes('git')
      ? fetchProjectGit(loadedProject.id).catch(() => null)
      : Promise.resolve(null);
    const [git] = await Promise.all([gitPromise]);

    if (projectId.value !== requestedProjectId) return;
    if (git) updateGitOverview(git);
  } catch (error) {
    if (projectId.value === requestedProjectId) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o projeto.';
    }
  } finally {
    if (projectId.value === requestedProjectId) {
      loading.value = false;
    }
  }
}

watch(
  projectId,
  () => {
    void loadProject();
  },
  {
    immediate: true,
  },
);
</script>

<template>
  <section
    class="content project-details-page"
    :class="{
      'project-details-page-pty':
        isTestsRoute ||
        isTerminalRoute ||
        isConsoleRoute ||
        isRailsSidekiqRoute ||
        isRailsWebpackRoute,
    }"
  >
    <div v-if="loading" class="empty-state page-empty-state">
      <div class="empty-icon">•••</div>
      <h3>Carregando projeto</h3>
      <p>Localizando o repositório e suas configurações.</p>
    </div>

    <div v-else-if="errorMessage" class="empty-state page-empty-state">
      <div class="empty-icon">!</div>
      <h3>Não foi possível carregar o projeto</h3>
      <p>{{ errorMessage }}</p>
      <button class="primary-button" type="button" @click="loadProject">
        Tentar novamente
      </button>
    </div>

    <div v-else-if="!project" class="empty-state page-empty-state">
      <div class="empty-icon">◇</div>
      <h3>Projeto não encontrado</h3>
      <p>
        O projeto pode ter sido removido ou o workspace ainda não contém esse
        identificador.
      </p>
      <RouterLink class="primary-button link-button" to="/">
        Voltar aos projetos
      </RouterLink>
    </div>

    <template v-else>
      <div class="project-details-sticky-header">
        <header class="project-details-hero">
          <div class="project-details-main">
            <div class="project-details-copy">
              <span class="project-details-eyebrow">Projeto atual</span>
              <div class="project-title-row">
                <h2>{{ project.name }}</h2>
                <div
                  v-if="gitBranch"
                  class="project-details-branch"
                  aria-label="Branch atual"
                >
                  <ShareIcon aria-hidden="true" />
                  <span>{{ gitBranch }}</span>
                </div>
              </div>
              <div class="project-details-repository" :title="project.path">
                <span class="project-details-repository-label"
                  >Repositório</span
                >
                <code>{{ project.path }}</code>
              </div>
            </div>
          </div>

          <div class="project-details-actions">
            <div v-if="project.enabled" class="project-details-actions-row">
              <ProjectProcessesMenu
                :project="project"
                @database-supported="databaseSupported = $event"
                @worker-detected="
                  (workerId, detected) => {
                    if (workerId === 'sidekiq') sidekiqDetected = detected;
                    if (workerId === 'webpack') webpackDetected = detected;
                  }
                "
              />
            </div>
            <ProjectPullRequestSummary
              v-if="project.enabled && gitOverview"
              :project-id="project.id"
              :overview="gitOverview"
            />
          </div>
        </header>

        <nav class="project-details-tabs" aria-label="Áreas do projeto">
          <div class="project-details-primary-tabs">
            <RouterLink
              class="project-details-tab"
              :class="{ 'project-details-tab-active': isServerRoute }"
              :aria-current="isServerRoute ? 'page' : undefined"
              :to="{
                name: 'project-server',
                params: { projectId: project.id },
              }"
            >
              <ServerStackIcon aria-hidden="true" />
              <span>Servidor</span>
            </RouterLink>

            <RouterLink
              class="project-details-tab"
              :class="{ 'project-details-tab-active': isGitRoute }"
              :aria-current="isGitRoute ? 'page' : undefined"
              :to="{ name: 'project-git', params: { projectId: project.id } }"
            >
              <CodeBracketIcon aria-hidden="true" />
              <span>Git</span>
            </RouterLink>

            <RouterLink
              class="project-details-tab"
              :class="{ 'project-details-tab-active': isTestsRoute }"
              :aria-current="isTestsRoute ? 'page' : undefined"
              :to="{ name: 'project-tests', params: { projectId: project.id } }"
            >
              <BeakerIcon aria-hidden="true" />
              <span>Testes</span>
            </RouterLink>

            <RouterLink
              class="project-details-tab"
              :class="{ 'project-details-tab-active': isTerminalRoute }"
              :aria-current="isTerminalRoute ? 'page' : undefined"
              :to="{
                name: 'project-terminal',
                params: { projectId: project.id },
              }"
            >
              <CommandLineIcon aria-hidden="true" />
              <span>Terminal</span>
            </RouterLink>
          </div>

          <ProjectDetailsMoreTools
            :project="project"
            :database-supported="databaseSupported"
            :sidekiq-detected="sidekiqDetected"
            :webpack-detected="webpackDetected"
          />
        </nav>
      </div>

      <ProjectReadmePanel
        v-if="isReadmeRoute"
        :key="`readme-${project.id}`"
        :project="project"
      />

      <ProjectDoctorPanel
        v-else-if="isDoctorRoute"
        :key="`doctor-${project.id}`"
        :project="project"
      />

      <ProjectServerPanel
        v-else-if="isServerRoute"
        :key="`server-${project.id}`"
        :project="project"
      />

      <ProjectGitPanel
        v-else-if="isGitRoute"
        :key="`git-${project.id}`"
        :project="project"
        @git-updated="updateGitOverview"
      />

      <ProjectTestsPanel
        v-else-if="isTestsRoute"
        :key="`tests-${project.id}`"
        :project="project"
      />

      <ProjectDatabasePanel
        v-else-if="isDatabaseRoute"
        :key="`database-${project.id}`"
        :project="project"
      />

      <ProjectDependenciesPanel
        v-else-if="isDependenciesRoute"
        :key="`dependencies-${project.id}`"
        :project="project"
      />

      <ProjectTerminalPanel
        v-else-if="isTerminalRoute"
        :key="`terminal-${project.id}`"
        :project="project"
        kind="shell"
        title="Terminal"
        description="Abre um shell interativo na raiz do projeto, no mesmo ambiente do seu usuário local."
        auto-start
      />

      <ProjectTerminalPanel
        v-else-if="isConsoleRoute"
        :key="`console-${project.id}`"
        :project="project"
        kind="rails-console"
        title="Console Rails"
        description="Abre `bin/rails console` (ou `bundle exec rails console`) na raiz do projeto."
        auto-start
      />

      <ProjectRailsRuntimePanel
        v-else-if="isRailsSidekiqRoute"
        :key="`rails-sidekiq-${project.id}`"
        :project="project"
        worker-id="sidekiq"
      />

      <ProjectRailsRuntimePanel
        v-else-if="isRailsWebpackRoute"
        :key="`rails-webpack-${project.id}`"
        :project="project"
        worker-id="webpack"
      />

      <ProjectEnvironmentPanel
        v-else-if="isEnvironmentRoute"
        :key="`environment-${project.id}`"
        :project="project"
      />
    </template>
  </section>
</template>

<style scoped src="./ProjectDetailsView.css"></style>
