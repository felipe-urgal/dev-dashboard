<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CircleStackIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CubeIcon,
  DocumentTextIcon,
  EllipsisHorizontalIcon,
  QueueListIcon,
  ShieldCheckIcon,
  ServerStackIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';

import { RouterLink, useRoute } from 'vue-router';

import type { Project, ProjectGitOverview } from '@dev-dashboard/contracts';

import {
  fetchProjectDatabase,
  fetchProjectGit,
  fetchProjectRailsWorker,
} from '../api';
import ProjectDatabasePanel from '../components/ProjectDatabasePanel.vue';
import ProjectDependenciesPanel from '../components/ProjectDependenciesPanel.vue';
import ProjectDoctorPanel from '../components/ProjectDoctorPanel.vue';
import ProjectGitPanel from '../components/ProjectGitPanel.vue';
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
// Ferramentas secundárias permanecem acessíveis pelo menu contextual.
const moreToolsOpen = ref(false);
const moreToolsTrigger = ref<HTMLButtonElement | null>(null);
const moreToolsPosition = ref({ top: 0, right: 12 });

function updateMoreToolsPosition(): void {
  const trigger = moreToolsTrigger.value;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  moreToolsPosition.value = {
    top: rect.bottom + 6,
    right: Math.max(12, window.innerWidth - rect.right),
  };
}

function closeMoreTools(): void {
  moreToolsOpen.value = false;
  window.removeEventListener('resize', updateMoreToolsPosition);
  window.removeEventListener('scroll', updateMoreToolsPosition, true);
}

async function toggleMoreTools(): Promise<void> {
  if (moreToolsOpen.value) {
    closeMoreTools();
    return;
  }

  moreToolsOpen.value = true;
  await nextTick();
  updateMoreToolsPosition();
  window.addEventListener('resize', updateMoreToolsPosition);
  window.addEventListener('scroll', updateMoreToolsPosition, true);
}

onBeforeUnmount(closeMoreTools);

const isMoreToolRoute = computed(
  () =>
    isDatabaseRoute.value ||
    isDependenciesRoute.value ||
    isConsoleRoute.value ||
    isRailsSidekiqRoute.value ||
    isRailsWebpackRoute.value ||
    isEnvironmentRoute.value ||
    isDoctorRoute.value ||
    isReadmeRoute.value,
);

function updateGitOverview(git: ProjectGitOverview): void {
  gitBranch.value = git.branch ?? '';
  gitOverview.value = git;
}

async function loadProject(): Promise<void> {
  const requestedProjectId = projectId.value;
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

    if (loadedProject.type === 'rails') {
      try {
        const sidekiq = await fetchProjectRailsWorker(
          loadedProject.id,
          'sidekiq',
        );
        if (projectId.value === requestedProjectId)
          sidekiqDetected.value = sidekiq.detected;
      } catch {
        // Mantém a aba visível: o painel mostra o próprio erro ao ser aberto.
      }

      try {
        const webpack = await fetchProjectRailsWorker(
          loadedProject.id,
          'webpack',
        );
        if (projectId.value === requestedProjectId)
          webpackDetected.value = webpack.detected;
      } catch {
        // Mantém a aba visível: o painel mostra o próprio erro ao ser aberto.
      }
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
</script>

<template>
  <section class="content project-details-page">
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
            </div>
          </div>

          <div class="project-details-actions">
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

        <nav class="project-details-tabs" aria-label="Áreas do projeto">
          <div class="project-details-primary-tabs">
            <RouterLink
              class="project-details-tab"
              :class="{ 'project-details-tab-active': isServerRoute }"
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
              :to="{ name: 'project-git', params: { projectId: project.id } }"
            >
              <CodeBracketIcon aria-hidden="true" />
              <span>Git</span>
            </RouterLink>

            <RouterLink
              class="project-details-tab"
              :class="{ 'project-details-tab-active': isTestsRoute }"
              :to="{ name: 'project-tests', params: { projectId: project.id } }"
            >
              <BeakerIcon aria-hidden="true" />
              <span>Testes</span>
            </RouterLink>

            <RouterLink
              class="project-details-tab"
              :class="{ 'project-details-tab-active': isTerminalRoute }"
              :to="{
                name: 'project-terminal',
                params: { projectId: project.id },
              }"
            >
              <CommandLineIcon aria-hidden="true" />
              <span>Terminal</span>
            </RouterLink>
          </div>

          <div class="project-details-more-menu">
            <button
              type="button"
              ref="moreToolsTrigger"
              class="project-details-more-trigger"
              :class="{
                'project-details-more-trigger-active': isMoreToolRoute,
              }"
              aria-label="Mais ferramentas"
              aria-haspopup="menu"
              :aria-expanded="moreToolsOpen"
              @click="toggleMoreTools"
            >
              <EllipsisHorizontalIcon aria-hidden="true" />
            </button>

          <Teleport to="body">
            <div
              v-if="moreToolsOpen"
              class="project-details-more-popover"
              :style="{
                top: `${moreToolsPosition.top}px`,
                right: `${moreToolsPosition.right}px`,
              }"
              role="menu"
            >
              <RouterLink
                v-if="databaseSupported"
                class="project-details-more-item"
                :class="{ 'project-details-more-item-active': isDatabaseRoute }"
                :to="{
                  name: 'project-database',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <CircleStackIcon aria-hidden="true" />
                <span>Banco de dados</span>
              </RouterLink>
              <RouterLink
                v-if="project.type === 'rails' || project.type === 'node'"
                class="project-details-more-item"
                :class="{
                  'project-details-more-item-active': isDependenciesRoute,
                }"
                :to="{
                  name: 'project-dependencies',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <CubeIcon aria-hidden="true" />
                <span>Dependências</span>
              </RouterLink>
              <RouterLink
                v-if="project.type === 'rails'"
                class="project-details-more-item"
                :class="{ 'project-details-more-item-active': isConsoleRoute }"
                :to="{
                  name: 'project-console',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <CommandLineIcon aria-hidden="true" />
                <span>Console</span>
              </RouterLink>
              <RouterLink
                v-if="project.type === 'rails' && sidekiqDetected"
                class="project-details-more-item"
                :class="{
                  'project-details-more-item-active': isRailsSidekiqRoute,
                }"
                :to="{
                  name: 'project-rails-sidekiq',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <QueueListIcon aria-hidden="true" />
                <span>Sidekiq</span>
              </RouterLink>
              <RouterLink
                v-if="project.type === 'rails' && webpackDetected"
                class="project-details-more-item"
                :class="{
                  'project-details-more-item-active': isRailsWebpackRoute,
                }"
                :to="{
                  name: 'project-rails-webpack',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <CodeBracketIcon aria-hidden="true" />
                <span>Webpack</span>
              </RouterLink>
              <RouterLink
                class="project-details-more-item"
                :class="{
                  'project-details-more-item-active': isEnvironmentRoute,
                }"
                :to="{
                  name: 'project-environment',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <AdjustmentsHorizontalIcon aria-hidden="true" />
                <span>Variáveis de ambiente</span>
              </RouterLink>
              <RouterLink
                class="project-details-more-item"
                :class="{ 'project-details-more-item-active': isDoctorRoute }"
                :to="{
                  name: 'project-doctor',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <ShieldCheckIcon aria-hidden="true" />
                <span>Diagnóstico</span>
              </RouterLink>
              <RouterLink
                class="project-details-more-item"
                :class="{ 'project-details-more-item-active': isReadmeRoute }"
                :to="{
                  name: 'project-readme',
                  params: { projectId: project.id },
                }"
                role="menuitem"
                @click="closeMoreTools"
              >
                <DocumentTextIcon aria-hidden="true" />
                <span>README</span>
              </RouterLink>
            </div>
          </Teleport>
          </div>
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
