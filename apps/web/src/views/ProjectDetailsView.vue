<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import {
  ClipboardDocumentIcon,
  CodeBracketIcon,
  FolderIcon,
  ShareIcon,
  Squares2X2Icon,
} from '@heroicons/vue/24/outline';

import {
  RouterLink,
  useRoute,
} from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import { fetchProjectGit } from '../api';
import ProjectAvatar from '../components/ProjectAvatar.vue';
import ProjectDatabasePanel from '../components/ProjectDatabasePanel.vue';
import ProjectGitPanel from '../components/ProjectGitPanel.vue';
import ProjectLogsPanel from '../components/ProjectLogsPanel.vue';
import ProjectReadmePanel from '../components/ProjectReadmePanel.vue';
import ProjectScriptsPanel from '../components/ProjectScriptsPanel.vue';
import ProjectServerPanel from '../components/ProjectServerPanel.vue';
import ProjectTestsPanel from '../components/ProjectTestsPanel.vue';
import { dashboardStore } from '../stores/dashboard';
import { projectTypeLabels } from '../utils/project-labels';

const route = useRoute();

const project = ref<Project | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const gitBranch = ref('');
const pathCopied = ref(false);
let copiedMessageTimer: ReturnType<typeof setTimeout> | undefined;

const projectId = computed(() => {
  const value = route.params.projectId;
  return Array.isArray(value) ? value[0] ?? '' : String(value ?? '');
});

const isReadmeRoute = computed(() => route.name === 'project-details');
const isServerRoute = computed(() => route.name === 'project-server');
const isLogsRoute = computed(() => route.name === 'project-logs');
const isGitRoute = computed(() => route.name === 'project-git');
const isTestsRoute = computed(() => route.name === 'project-tests');
const isDatabaseRoute = computed(() => route.name === 'project-database');
const isScriptsRoute = computed(() => route.name === 'project-scripts');

const workspace = computed(() => {
  const workspaceId = project.value?.workspaceId;
  if (!workspaceId) return null;

  return dashboardStore.workspaces.value.find(
    (item) => item.id === workspaceId,
  ) ?? null;
});

const projectSourceLabel = computed(() => {
  if (project.value?.source === 'workspace') return 'Workspace';
  if (project.value?.source === 'standalone') return 'Projeto avulso';
  return 'Origem local';
});

async function loadProject(): Promise<void> {
  const requestedProjectId = projectId.value;
  loading.value = true;
  errorMessage.value = '';
  project.value = null;
  gitBranch.value = '';

  try {
    const loadedProject = await dashboardStore.ensureProject(requestedProjectId);
    if (projectId.value !== requestedProjectId || !loadedProject) return;

    project.value = loadedProject;

    if (loadedProject.capabilities.includes('git')) {
      try {
        const git = await fetchProjectGit(loadedProject.id);
        if (projectId.value === requestedProjectId) {
          gitBranch.value = git.branch ?? '';
        }
      } catch {
        gitBranch.value = '';
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

async function copyProjectPath(): Promise<void> {
  if (!project.value) return;

  try {
    await navigator.clipboard.writeText(project.value.path);
    pathCopied.value = true;

    if (copiedMessageTimer) clearTimeout(copiedMessageTimer);
    copiedMessageTimer = setTimeout(() => {
      pathCopied.value = false;
    }, 2_000);
  } catch {
    pathCopied.value = false;
  }
}

watch(projectId, () => {
  void loadProject();
}, {
  immediate: true,
});

onBeforeUnmount(() => {
  if (copiedMessageTimer) clearTimeout(copiedMessageTimer);
});
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
          <div class="project-details-identity">
            <ProjectAvatar
              :project="project"
              class="project-details-avatar"
            />

            <div class="project-details-copy">
              <div class="project-title-row">
                <h2>{{ project.name }}</h2>
                <span
                  class="type-badge"
                  :class="`type-badge-${project.type}`"
                >
                  {{ projectTypeLabels[project.type] }}
                </span>
              </div>
              <code>{{ project.path }}</code>
            </div>
          </div>

          <div class="project-details-metadata" aria-label="Metadados do projeto">
            <span>
              <FolderIcon aria-hidden="true" />
              {{ workspace?.name ?? 'Sem workspace' }}
            </span>
            <span v-if="gitBranch">
              <ShareIcon aria-hidden="true" />
              {{ gitBranch }}
            </span>
            <span>
              <CodeBracketIcon aria-hidden="true" />
              {{ projectSourceLabel }}
            </span>
            <span>
              <Squares2X2Icon aria-hidden="true" />
              {{ project.capabilities.length }} capacidades
            </span>
          </div>
        </div>

        <div class="project-details-actions">
          <button type="button" @click="copyProjectPath">
            <ClipboardDocumentIcon aria-hidden="true" />
            {{ pathCopied ? 'Caminho copiado' : 'Copiar caminho' }}
          </button>

          <RouterLink
            v-if="project.capabilities.includes('git')"
            :to="{ name: 'project-git', params: { projectId: project.id } }"
          >
            <ShareIcon aria-hidden="true" />
            Abrir Git
          </RouterLink>

          <RouterLink
            v-if="project.capabilities.includes('scripts')"
            class="project-primary-action"
            :to="{ name: 'project-scripts', params: { projectId: project.id } }"
          >
            <CodeBracketIcon aria-hidden="true" />
            Executar script
          </RouterLink>
        </div>
      </header>

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
          :class="{ 'project-details-tab-active': isTestsRoute }"
          :to="{ name: 'project-tests', params: { projectId: project.id } }"
        >
          Testes
        </RouterLink>

        <RouterLink
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
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isScriptsRoute }"
          :to="{ name: 'project-scripts', params: { projectId: project.id } }"
        >
          Scripts
        </RouterLink>
      </nav>

      <div v-if="isReadmeRoute" class="project-readme-layout">
        <ProjectReadmePanel
          :key="`readme-${project.id}`"
          :project="project"
        />

        <aside class="project-readme-sidebar">
          <section class="project-summary-card">
            <span class="section-kicker">Resumo do projeto</span>
            <dl>
              <div>
                <dt>Workspace</dt>
                <dd>{{ workspace?.name ?? 'Não associado' }}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{{ projectTypeLabels[project.type] }}</dd>
              </div>
              <div>
                <dt>Origem</dt>
                <dd>{{ project.source }}</dd>
              </div>
              <div>
                <dt>Capacidades</dt>
                <dd>{{ project.capabilities.length }}</dd>
              </div>
            </dl>
          </section>

          <section class="project-quick-links-card">
            <span class="section-kicker">Acessos rápidos</span>
            <RouterLink
              :to="{
                name: 'project-server',
                params: { projectId: project.id },
              }"
            >
              Gerenciar servidor
              <span aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink
              :to="{
                name: 'project-logs',
                params: { projectId: project.id },
              }"
            >
              Acompanhar logs
              <span aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink
              :to="{
                name: 'project-git',
                params: { projectId: project.id },
              }"
            >
              Abrir Git
              <span aria-hidden="true">→</span>
            </RouterLink>
          </section>
        </aside>
      </div>

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

      <ProjectScriptsPanel
        v-else-if="isScriptsRoute"
        :key="`scripts-${project.id}`"
        :project="project"
      />
    </template>
  </section>
</template>

<style scoped>
.project-details-page {
  display: grid;
  gap: 14px;
}

.project-details-hero {
  display: flex;
  min-height: 136px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: 22px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: 0 14px 36px rgb(0 0 0 / 3.5%);
}

.project-details-main {
  display: grid;
  min-width: 0;
  gap: 14px;
}

.project-details-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 18px;
}

.project-details-copy {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.project-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.project-title-row h2 {
  overflow: hidden;
  margin: 0;
  color: var(--text);
  font-size: clamp(26px, 3vw, 34px);
  line-height: 1;
  letter-spacing: -0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-details-copy code {
  display: block;
  overflow: hidden;
  max-width: min(640px, 58vw);
  color: var(--text-dim);
  font-size: var(--font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-details-avatar {
  width: 62px;
  height: 62px;
  border-radius: 16px;
  font-size: 15px;
}

.project-details-metadata {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px 18px;
  padding-left: 80px;
  color: var(--text-dim);
  font-size: 10px;
}

.project-details-metadata span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.project-details-metadata svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.project-details-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  flex-wrap: wrap;
}

.project-details-actions button,
.project-details-actions a {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
  font: inherit;
  font-size: 11px;
  font-weight: var(--font-weight-strong);
  text-decoration: none;
  transition:
    transform 150ms ease,
    border-color 150ms ease,
    background 150ms ease,
    color 150ms ease;
}

.project-details-actions button:hover,
.project-details-actions a:hover {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-2);
  transform: translateY(-1px);
}

.project-details-actions .project-primary-action {
  border-color: var(--accent);
  color: white;
  background: var(--accent);
}

.project-details-actions svg {
  width: 16px;
  height: 16px;
}

.project-details-tabs {
  display: flex;
  min-width: 0;
  align-items: stretch;
  gap: 4px;
  overflow-x: auto;
  padding: 0 4px;
  border-bottom: 1px solid var(--border);
  scrollbar-width: thin;
}

.project-details-tab {
  position: relative;
  display: inline-flex;
  min-height: 43px;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 14px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: var(--font-weight-strong);
  text-decoration: none;
  transition:
    color 150ms ease,
    background 150ms ease;
}

.project-details-tab::after {
  position: absolute;
  right: 10px;
  bottom: -1px;
  left: 10px;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: transparent;
  content: '';
}

.project-details-tab:hover {
  color: var(--text);
  background: var(--surface-2);
}

.project-details-tab-active {
  color: var(--accent);
}

.project-details-tab-active::after {
  background: var(--accent);
}

.project-readme-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: var(--space-4);
  align-items: start;
}

.project-readme-sidebar {
  display: grid;
  gap: var(--space-4);
}

.project-summary-card,
.project-quick-links-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: 0 12px 32px rgb(0 0 0 / 3.5%);
}

.project-summary-card,
.project-quick-links-card {
  padding: var(--space-4);
}

.project-summary-card dl {
  display: grid;
  gap: 0;
  margin: 10px 0 0;
}

.project-summary-card dl > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--border);
}

.project-summary-card dl > div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.project-summary-card dt {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.project-summary-card dd {
  max-width: 58%;
  margin: 0;
  color: var(--text);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-align: right;
  overflow-wrap: anywhere;
}

.project-quick-links-card {
  display: grid;
  gap: 8px;
}

.project-quick-links-card .section-kicker {
  margin-bottom: 4px;
}

.project-quick-links-card a {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-decoration: none;
}

.project-quick-links-card a:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

@media (max-width: 1180px) {
  .project-details-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .project-details-actions {
    justify-content: flex-start;
  }

  .project-details-copy code {
    max-width: 75vw;
  }

  .project-readme-layout {
    grid-template-columns: 1fr;
  }

  .project-readme-sidebar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .project-details-hero {
    min-height: 0;
    padding: 18px;
  }

  .project-details-identity {
    align-items: flex-start;
  }

  .project-details-avatar {
    width: 52px;
    height: 52px;
  }

  .project-title-row {
    align-items: flex-start;
    flex-direction: column-reverse;
    gap: 7px;
  }

  .project-title-row h2 {
    font-size: 26px;
  }

  .project-details-copy code {
    max-width: 62vw;
  }

  .project-details-metadata {
    padding-left: 0;
  }

  .project-details-actions {
    width: 100%;
  }

  .project-details-actions > * {
    flex: 1 1 140px;
  }

  .project-details-tab {
    padding: 0 11px;
  }

  .project-readme-sidebar {
    grid-template-columns: 1fr;
  }
}
</style>
