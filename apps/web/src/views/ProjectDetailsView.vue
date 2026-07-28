<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import {
  BeakerIcon,
  BookOpenIcon,
  CircleStackIcon,
  CommandLineIcon,
  DocumentTextIcon,
  ServerStackIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';

import {
  RouterLink,
  useRoute,
} from 'vue-router';

import type { Project } from '@dev-dashboard/contracts';

import ProjectAvatar from '../components/ProjectAvatar.vue';
import ProjectDatabasePanel from '../components/ProjectDatabasePanel.vue';
import ProjectGitPanel from '../components/ProjectGitPanel.vue';
import ProjectLogsPanel from '../components/ProjectLogsPanel.vue';
import ProjectReadmePanel from '../components/ProjectReadmePanel.vue';
import ProjectScriptsPanel from '../components/ProjectScriptsPanel.vue';
import ProjectServerPanel from '../components/ProjectServerPanel.vue';
import ProjectTestsPanel from '../components/ProjectTestsPanel.vue';
import { dashboardStore } from '../stores/dashboard';

import {
  capabilityLabel,
  projectTypeLabels,
} from '../utils/project-labels';

const route = useRoute();

const project = ref<Project | null>(null);
const loading = ref(true);
const errorMessage = ref('');

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

async function loadProject(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  project.value = null;

  try {
    project.value = await dashboardStore.ensureProject(projectId.value);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o projeto.';
  } finally {
    loading.value = false;
  }
}

watch(projectId, () => {
  void loadProject();
}, {
  immediate: true,
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
        <div class="project-details-identity">
          <ProjectAvatar
            :project="project"
            class="project-details-avatar"
          />

          <div class="project-details-copy">
            <div class="project-details-badges">
              <span
                class="type-badge"
                :class="`type-badge-${project.type}`"
              >
                {{ projectTypeLabels[project.type] }}
              </span>
              <span>{{ workspace?.name ?? project.source }}</span>
            </div>

            <h2>{{ project.name }}</h2>
            <code>{{ project.path }}</code>
          </div>
        </div>

        <div class="project-details-capabilities" aria-label="Capacidades">
          <span
            v-for="capability in project.capabilities"
            :key="capability"
            class="project-capability-chip"
          >
            <span aria-hidden="true" />
            {{ capabilityLabel(capability) }}
          </span>
        </div>
      </header>

      <nav class="project-details-tabs" aria-label="Áreas do projeto">
        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isReadmeRoute }"
          :to="{ name: 'project-details', params: { projectId: project.id } }"
        >
          <BookOpenIcon aria-hidden="true" />
          README
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isServerRoute }"
          :to="{ name: 'project-server', params: { projectId: project.id } }"
        >
          <ServerStackIcon aria-hidden="true" />
          Servidor
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isLogsRoute }"
          :to="{ name: 'project-logs', params: { projectId: project.id } }"
        >
          <DocumentTextIcon aria-hidden="true" />
          Logs
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isGitRoute }"
          :to="{ name: 'project-git', params: { projectId: project.id } }"
        >
          <ShareIcon aria-hidden="true" />
          Git
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isTestsRoute }"
          :to="{ name: 'project-tests', params: { projectId: project.id } }"
        >
          <BeakerIcon aria-hidden="true" />
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
          <CircleStackIcon aria-hidden="true" />
          Banco de dados
        </RouterLink>

        <RouterLink
          class="project-details-tab"
          :class="{ 'project-details-tab-active': isScriptsRoute }"
          :to="{ name: 'project-scripts', params: { projectId: project.id } }"
        >
          <CommandLineIcon aria-hidden="true" />
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
              <ServerStackIcon aria-hidden="true" />
              Gerenciar servidor
              <span aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink
              :to="{
                name: 'project-logs',
                params: { projectId: project.id },
              }"
            >
              <DocumentTextIcon aria-hidden="true" />
              Acompanhar logs
              <span aria-hidden="true">→</span>
            </RouterLink>
            <RouterLink
              :to="{
                name: 'project-git',
                params: { projectId: project.id },
              }"
            >
              <ShareIcon aria-hidden="true" />
              Abrir Git
              <span aria-hidden="true">→</span>
            </RouterLink>
          </section>
        </aside>
      </div>

      <section v-else-if="isServerRoute" class="project-server-view">
        <div class="project-section-intro">
          <div>
            <span class="section-kicker">Execução</span>
            <h3>Servidor do projeto</h3>
          </div>
          <p>
            Configure a porta, inicie ou pare o processo e acesse os endereços
            locais da aplicação.
          </p>
        </div>

        <ProjectServerPanel
          :key="`server-${project.id}`"
          :project="project"
        />
      </section>

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
  gap: var(--space-4);
}

.project-details-hero {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: clamp(22px, 3vw, 34px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 0 0, var(--accent-soft), transparent 42%),
    var(--surface-1);
  box-shadow: 0 18px 45px rgb(0 0 0 / 4%);
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

.project-details-copy h2 {
  margin: 0;
  color: var(--text);
  font-size: clamp(25px, 3vw, 36px);
  line-height: 1;
  letter-spacing: -0.04em;
}

.project-details-copy code {
  overflow: hidden;
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

.project-details-badges {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-dim);
  font-size: 10px;
}

.project-details-capabilities {
  display: flex;
  max-width: 560px;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.project-capability-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.project-capability-chip > span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--success-text);
  box-shadow: 0 0 0 3px var(--success-surface);
}

.project-details-tabs {
  display: flex;
  min-width: 0;
  align-items: stretch;
  gap: 4px;
  overflow-x: auto;
  padding: 0 2px;
  border-bottom: 1px solid var(--border);
  scrollbar-width: thin;
}

.project-details-tab {
  position: relative;
  display: inline-flex;
  min-height: 48px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  color: var(--text-muted);
  font-size: var(--font-xs);
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

.project-details-tab svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
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
.project-quick-links-card,
.project-section-intro {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: 0 14px 34px rgb(0 0 0 / 4%);
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
  grid-template-columns: 18px minmax(0, 1fr) 14px;
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

.project-quick-links-card svg {
  width: 16px;
  height: 16px;
}

.project-section-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-6);
  margin-bottom: var(--space-4);
  padding: var(--space-5);
}

.project-section-intro h3 {
  margin: 5px 0 0;
  color: var(--text);
  font-size: var(--font-lg);
}

.project-section-intro p {
  max-width: 560px;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.65;
}

.project-server-view :deep(.project-server-actions),
.project-server-view :deep(.project-log-panel) {
  display: none;
}

@media (max-width: 1100px) {
  .project-details-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .project-details-capabilities {
    max-width: none;
    justify-content: flex-start;
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
  }

  .project-details-identity {
    align-items: flex-start;
  }

  .project-details-avatar {
    width: 52px;
    height: 52px;
  }

  .project-details-copy code {
    max-width: 65vw;
  }

  .project-details-tab {
    padding: 0 11px;
  }

  .project-readme-sidebar {
    grid-template-columns: 1fr;
  }

  .project-section-intro {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
