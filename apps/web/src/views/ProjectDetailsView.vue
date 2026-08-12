<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';

import { ShareIcon } from '@heroicons/vue/24/outline';

import { RouterLink, useRoute } from 'vue-router';

import type {
  AiImplementationExecution,
  Project,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectAiImplementation,
  fetchProjectDatabase,
  fetchProjectGit,
} from '../api';
import ProjectAiAssistantPanel from '../components/ProjectAiAssistantPanel.vue';
import ProjectAiExecutionPill from '../components/ProjectAiExecutionPill.vue';
import ProjectDatabasePanel from '../components/ProjectDatabasePanel.vue';
import ProjectDependenciesPanel from '../components/ProjectDependenciesPanel.vue';
import ProjectDoctorPanel from '../components/ProjectDoctorPanel.vue';
import ProjectGitPanel from '../components/ProjectGitPanel.vue';
import ProjectLogsPanel from '../components/ProjectLogsPanel.vue';
import ProjectProcessesMenu from '../components/ProjectProcessesMenu.vue';
import ProjectPullRequestSummary from '../components/ProjectPullRequestSummary.vue';
import ProjectRailsRuntimePanel from '../components/ProjectRailsRuntimePanel.vue';
import ProjectEnvironmentPanel from '../components/ProjectEnvironmentPanel.vue';
import ProjectReadmePanel from '../components/ProjectReadmePanel.vue';
import ProjectServerPanel from '../components/ProjectServerPanel.vue';
import ProjectTerminalPanel from '../components/ProjectTerminalPanel.vue';
import ProjectTestsPanel from '../components/ProjectTestsPanel.vue';
import { dashboardStore } from '../stores/dashboard';
import { recordProjectVisit } from '../stores/project-recents';
import { projectTypeLabels } from '../utils/project-labels';

const route = useRoute();

const { toggleProjectEnabled, enabledUpdatingIds, projectIndex } =
  dashboardStore;

const project = ref<Project | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const gitBranch = ref('');
const gitOverview = ref<ProjectGitOverview | null>(null);
/** Otimista: assume que há banco até a detecção confirmar o contrário, evitando a aba piscar para o caso comum. */
const databaseSupported = ref(true);
const aiImplementation = ref<AiImplementationExecution | null>(null);
let aiExecutionTimer: ReturnType<typeof setTimeout> | undefined;
let aiExecutionGeneration = 0;

const projectId = computed(() => {
  const value = route.params.projectId;
  return Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
});

const isReadmeRoute = computed(() => route.name === 'project-details');
const isDoctorRoute = computed(() => route.name === 'project-doctor');
const isServerRoute = computed(() => route.name === 'project-server');
const isLogsRoute = computed(() => route.name === 'project-logs');
const isGitRoute = computed(() => route.name === 'project-git');
const isAiAssistantRoute = computed(
  () => route.name === 'project-ai-assistant',
);
const isTestsRoute = computed(() => route.name === 'project-tests');
const isDatabaseRoute = computed(() => route.name === 'project-database');
const isDependenciesRoute = computed(
  () => route.name === 'project-dependencies',
);
const isRailsRuntimeRoute = computed(
  () => route.name === 'project-rails-runtime',
);
const isEnvironmentRoute = computed(() => route.name === 'project-environment');
const isTerminalRoute = computed(() => route.name === 'project-terminal');
const isConsoleRoute = computed(() => route.name === 'project-console');

function updateGitOverview(git: ProjectGitOverview): void {
  gitBranch.value = git.branch ?? '';
  gitOverview.value = git;
}

function scheduleAiImplementationPolling(generation: number): void {
  clearTimeout(aiExecutionTimer);
  if (
    generation !== aiExecutionGeneration ||
    isAiAssistantRoute.value ||
    aiImplementation.value?.status !== 'running'
  )
    return;
  aiExecutionTimer = setTimeout(
    () => void refreshAiImplementation(generation),
    1_500,
  );
}

async function refreshAiImplementation(
  generation = aiExecutionGeneration,
): Promise<void> {
  try {
    const result = await fetchProjectAiImplementation(projectId.value);
    if (generation !== aiExecutionGeneration) return;
    aiImplementation.value = result.execution;
  } catch {
    // A aba do assistente apresenta o erro detalhado quando estiver aberta.
  } finally {
    if (generation === aiExecutionGeneration) {
      scheduleAiImplementationPolling(generation);
    }
  }
}

async function loadProject(): Promise<void> {
  const requestedProjectId = projectId.value;
  loading.value = true;
  errorMessage.value = '';
  project.value = null;
  gitBranch.value = '';
  gitOverview.value = null;
  databaseSupported.value = true;
  aiImplementation.value = null;
  const currentAiExecutionGeneration = ++aiExecutionGeneration;
  clearTimeout(aiExecutionTimer);

  try {
    const loadedProject =
      await dashboardStore.ensureProject(requestedProjectId);
    if (projectId.value !== requestedProjectId || !loadedProject) return;

    project.value = loadedProject;
    void recordProjectVisit(loadedProject.id);
    void refreshAiImplementation(currentAiExecutionGeneration);

    if (loadedProject.capabilities.includes('git')) {
      try {
        const git = await fetchProjectGit(loadedProject.id);
        if (projectId.value === requestedProjectId) {
          updateGitOverview(git);
        }
      } catch {
        gitBranch.value = '';
        gitOverview.value = null;
      }
    }

    try {
      const database = await fetchProjectDatabase(loadedProject.id);
      if (projectId.value === requestedProjectId)
        databaseSupported.value = database.supported;
    } catch {
      // Mantém a aba visível: o painel mostra o próprio erro ao ser aberto.
    }
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

watch(isAiAssistantRoute, (isActive) => {
  clearTimeout(aiExecutionTimer);
  if (!isActive && aiImplementation.value?.status === 'running') {
    void refreshAiImplementation();
  }
});

onUnmounted(() => {
  aiExecutionGeneration += 1;
  clearTimeout(aiExecutionTimer);
});

const isEnabledUpdating = computed(() =>
  project.value ? enabledUpdatingIds.value.includes(project.value.id) : false,
);

async function handleToggleEnabled(): Promise<void> {
  if (!project.value) return;

  const requestedProjectId = project.value.id;
  await toggleProjectEnabled(project.value);

  if (project.value?.id !== requestedProjectId) return;

  const updated = projectIndex.value[requestedProjectId];
  if (updated) {
    project.value = updated;
  }
}
</script>

<template>
  <section class="content project-details-page">
    <RouterLink class="details-back-link" to="/">
      ← Voltar aos projetos
    </RouterLink>

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
      <header class="project-details-hero">
        <div class="project-details-main">
          <div class="project-details-copy">
            <div class="project-title-row">
              <h2>{{ project.name }}</h2>
              <span class="type-badge" :class="`type-badge-${project.type}`">
                {{ projectTypeLabels[project.type] }}
              </span>
            </div>
            <code>{{ project.path }}</code>
          </div>

          <div
            v-if="gitBranch"
            class="project-details-branch"
            aria-label="Branch atual"
          >
            <span>
              <ShareIcon aria-hidden="true" />
              {{ gitBranch }}
            </span>
          </div>
        </div>

        <div class="project-details-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="isEnabledUpdating"
            @click="handleToggleEnabled"
          >
            {{
              project.enabled
                ? isEnabledUpdating
                  ? 'Desativando...'
                  : 'Desativar projeto'
                : isEnabledUpdating
                  ? 'Reativando...'
                  : 'Reativar projeto'
            }}
          </button>
          <div v-if="project.enabled" class="project-details-actions-row">
            <ProjectProcessesMenu :project="project" />
          </div>
          <ProjectPullRequestSummary
            v-if="project.enabled && gitOverview"
            :project-id="project.id"
            :overview="gitOverview"
          />
        </div>
      </header>

      <div v-if="!project.enabled" class="empty-state page-empty-state">
        <div class="empty-icon">⏻</div>
        <h3>Projeto desativado</h3>
        <p>
          Reative o projeto para acessar servidor, logs, git, testes e as demais
          ações.
        </p>
        <button
          class="primary-button"
          type="button"
          :disabled="isEnabledUpdating"
          @click="handleToggleEnabled"
        >
          {{ isEnabledUpdating ? 'Reativando...' : 'Reativar projeto' }}
        </button>
      </div>

      <template v-else>
        <nav class="project-details-tabs" aria-label="Áreas do projeto">
          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isReadmeRoute }"
            :to="{ name: 'project-details', params: { projectId: project.id } }"
          >
            README
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isDoctorRoute }"
            :to="{ name: 'project-doctor', params: { projectId: project.id } }"
          >
            Diagnóstico
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isServerRoute }"
            :to="{ name: 'project-server', params: { projectId: project.id } }"
          >
            Servidor
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isLogsRoute }"
            :to="{ name: 'project-logs', params: { projectId: project.id } }"
          >
            Logs
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isGitRoute }"
            :to="{ name: 'project-git', params: { projectId: project.id } }"
          >
            Git
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isAiAssistantRoute }"
            :to="{
              name: 'project-ai-assistant',
              params: { projectId: project.id },
            }"
          >
            Assistente IA
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isTestsRoute }"
            :to="{ name: 'project-tests', params: { projectId: project.id } }"
          >
            Testes
          </RouterLink>

          <RouterLink
            v-if="databaseSupported"
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isDatabaseRoute }"
            :to="{
              name: 'project-database',
              params: { projectId: project.id },
            }"
          >
            Banco de dados
          </RouterLink>

          <RouterLink
            v-if="project.type === 'rails' || project.type === 'node'"
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isDependenciesRoute }"
            :to="{
              name: 'project-dependencies',
              params: { projectId: project.id },
            }"
          >
            Dependências
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isTerminalRoute }"
            :to="{
              name: 'project-terminal',
              params: { projectId: project.id },
            }"
          >
            Terminal
          </RouterLink>

          <RouterLink
            v-if="project.type === 'rails'"
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isConsoleRoute }"
            :to="{ name: 'project-console', params: { projectId: project.id } }"
          >
            Console
          </RouterLink>

          <RouterLink
            v-if="project.type === 'rails'"
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isRailsRuntimeRoute }"
            :to="{
              name: 'project-rails-runtime',
              params: { projectId: project.id },
            }"
          >
            Sidekiq/webpack
          </RouterLink>

          <RouterLink
            class="project-details-tab"
            :class="{ 'project-details-tab-active': isEnvironmentRoute }"
            :to="{
              name: 'project-environment',
              params: { projectId: project.id },
            }"
          >
            Variáveis de ambiente
          </RouterLink>
        </nav>

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

        <ProjectLogsPanel
          v-else-if="isLogsRoute"
          :key="`logs-${project.id}`"
          :project="project"
        />

        <ProjectGitPanel
          v-else-if="isGitRoute"
          :key="`git-${project.id}`"
          :project="project"
          @git-updated="updateGitOverview"
        />

        <ProjectAiAssistantPanel
          v-else-if="isAiAssistantRoute"
          :key="`ai-assistant-${project.id}`"
          :project="project"
          :project-id="projectId"
          @execution-updated="refreshAiImplementation()"
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
          v-else-if="isRailsRuntimeRoute"
          :key="`rails-runtime-${project.id}`"
          :project="project"
        />

        <ProjectEnvironmentPanel
          v-else-if="isEnvironmentRoute"
          :key="`environment-${project.id}`"
          :project="project"
        />

        <ProjectAiExecutionPill
          :project-id="project.id"
          :execution="aiImplementation"
        />
      </template>
    </template>
  </section>
</template>

<style scoped src="./ProjectDetailsView.css"></style>
