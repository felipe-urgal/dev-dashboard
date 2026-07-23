<script setup lang="ts">
import {
  computed,
  onMounted,
  ref
} from "vue";

import type {
  Project,
  ProjectCapability,
  ProjectType
} from "@dev-dashboard/contracts";

import {
  fetchHealth,
  fetchProjects,
  scanWorkspace
} from "./api";

const projects = ref<Project[]>([]);
const workspaceId = ref("caiena");
const workspacePath = ref(
  "/home/ubunru/Caiena/Projetos"
);

const apiConnected = ref(false);
const loadingProjects = ref(true);
const scanningWorkspace = ref(false);
const errorMessage = ref("");
const warningCount = ref(0);
const lastScannedPath = ref("");

const railsProjects = computed(
  () =>
    projects.value.filter(
      (project) => project.type === "rails"
    ).length
);

const nodeProjects = computed(
  () =>
    projects.value.filter(
      (project) => project.type === "node"
    ).length
);

const gitProjects = computed(
  () =>
    projects.value.filter(
      (project) =>
        project.capabilities.includes("git")
    ).length
);

const sortedProjects = computed(
  () =>
    [...projects.value].sort((left, right) =>
      left.name.localeCompare(right.name)
    )
);

const projectTypeLabels: Record<ProjectType, string> = {
  rails: "Rails",
  node: "Node",
  unknown: "Desconhecido"
};

const capabilityLabels: Record<
  ProjectCapability,
  string
> = {
  server: "Servidor",
  git: "Git",
  tests: "Testes",
  database: "Banco",
  scripts: "Scripts",
  webpack: "Webpack",
  sidekiq: "Sidekiq",
  rake: "Rake",
  bundler: "Bundler"
};

function projectInitials(name: string): string {
  return name
    .replace(/^[._-]+/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function typeLabel(type: ProjectType): string {
  return projectTypeLabels[type];
}

function capabilityLabel(
  capability: ProjectCapability
): string {
  return capabilityLabels[capability];
}

async function loadInitialData(): Promise<void> {
  loadingProjects.value = true;
  errorMessage.value = "";

  try {
    const [health, storedProjects] =
      await Promise.all([
        fetchHealth(),
        fetchProjects()
      ]);

    apiConnected.value = health.status === "ok";
    projects.value = storedProjects;
  } catch (error) {
    apiConnected.value = false;

    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar o dashboard";
  } finally {
    loadingProjects.value = false;
  }
}

async function handleScan(): Promise<void> {
  const id = workspaceId.value.trim();
  const path = workspacePath.value.trim();

  if (!id || !path) {
    errorMessage.value =
      "Informe o identificador e o caminho do workspace.";

    return;
  }

  scanningWorkspace.value = true;
  errorMessage.value = "";

  try {
    const result = await scanWorkspace({
      id,
      path
    });

    projects.value = result.projects;
    warningCount.value = result.warnings.length;
    lastScannedPath.value = result.workspacePath;
    apiConnected.value = true;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : "Não foi possível escanear o workspace";
  } finally {
    scanningWorkspace.value = false;
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
        <div class="brand-mark">
          DD
        </div>

        <div>
          <strong>Dev Dashboard</strong>
          <span>Local workspace</span>
        </div>
      </div>

      <nav
        class="navigation"
        aria-label="Navegação principal"
      >
        <a
          class="navigation-item navigation-item-active"
          href="#overview"
        >
          <span class="navigation-icon">⌂</span>
          Visão geral
        </a>

        <a
          class="navigation-item"
          href="#repositories"
        >
          <span class="navigation-icon">◇</span>
          Repositórios
        </a>

        <a
          class="navigation-item"
          href="#processes"
        >
          <span class="navigation-icon">▶</span>
          Processos
        </a>

        <a
          class="navigation-item"
          href="#jobs"
        >
          <span class="navigation-icon">≡</span>
          Jobs e logs
        </a>
      </nav>

      <div class="sidebar-section">
        <span class="sidebar-label">
          Workspace
        </span>

        <div class="workspace-summary">
          <span class="workspace-avatar">
            C
          </span>

          <div>
            <strong>
              {{ workspaceId || "Não selecionado" }}
            </strong>

            <span>
              {{ projects.length }} projetos
            </span>
          </div>
        </div>
      </div>

      <div class="sidebar-footer">
        <span
          class="connection-dot"
          :class="{
            'connection-dot-online': apiConnected
          }"
        />

        <span>
          API
          {{ apiConnected ? "conectada" : "desconectada" }}
        </span>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div>
          <span class="eyebrow">
            Ambiente local
          </span>

          <h1>Visão geral</h1>
        </div>

        <div class="topbar-actions">
          <button
            class="command-button"
            type="button"
            disabled
          >
            Buscar ou executar
            <kbd>⌘ K</kbd>
          </button>

          <div
            class="api-status"
            :class="{
              'api-status-online': apiConnected
            }"
          >
            <span />

            {{ apiConnected ? "Online" : "Offline" }}
          </div>
        </div>
      </header>

      <section
        id="overview"
        class="content"
      >
        <div class="hero-grid">
          <div class="hero-copy">
            <span class="section-kicker">
              Central de desenvolvimento
            </span>

            <h2>
              Seus projetos locais em um único lugar.
            </h2>

            <p>
              Detecte aplicações Rails e Node, visualize
              suas capacidades e prepare o ambiente para
              gerenciar processos, Git, testes e logs.
            </p>
          </div>

          <form
            class="workspace-form"
            @submit.prevent="handleScan"
          >
            <div class="form-heading">
              <div>
                <span class="section-kicker">
                  Workspace
                </span>

                <h3>Carregar projetos</h3>
              </div>

              <span class="local-badge">
                Local only
              </span>
            </div>

            <label>
              <span>Identificador</span>

              <input
                v-model="workspaceId"
                autocomplete="off"
                placeholder="caiena"
              />
            </label>

            <label>
              <span>Caminho local</span>

              <input
                v-model="workspacePath"
                autocomplete="off"
                placeholder="/home/usuario/projetos"
              />
            </label>

            <button
              class="primary-button"
              type="submit"
              :disabled="scanningWorkspace"
            >
              {{
                scanningWorkspace
                  ? "Escaneando..."
                  : "Escanear workspace"
              }}
            </button>
          </form>
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
          v-if="warningCount > 0"
          class="alert alert-warning"
        >
          <strong>
            Scan concluído com avisos.
          </strong>

          <span>
            {{ warningCount }}
            diretório(s) não puderam ser analisados.
          </span>
        </div>

        <div
          v-if="lastScannedPath"
          class="scan-result"
        >
          Workspace carregado:
          <code>{{ lastScannedPath }}</code>
        </div>

        <section
          class="metrics-grid"
          aria-label="Resumo dos projetos"
        >
          <article class="metric-card">
            <span class="metric-label">
              Repositórios
            </span>

            <strong>{{ projects.length }}</strong>

            <span class="metric-detail">
              projetos detectados
            </span>
          </article>

          <article class="metric-card">
            <span class="metric-label">
              Rails
            </span>

            <strong>{{ railsProjects }}</strong>

            <span class="metric-detail">
              aplicações Ruby
            </span>
          </article>

          <article class="metric-card">
            <span class="metric-label">
              Node
            </span>

            <strong>{{ nodeProjects }}</strong>

            <span class="metric-detail">
              aplicações JavaScript
            </span>
          </article>

          <article class="metric-card">
            <span class="metric-label">
              Git
            </span>

            <strong>{{ gitProjects }}</strong>

            <span class="metric-detail">
              repositórios versionados
            </span>
          </article>
        </section>

        <section
          id="repositories"
          class="repositories-section"
        >
          <div class="section-heading">
            <div>
              <span class="section-kicker">
                Repositórios
              </span>

              <h2>Projetos detectados</h2>
            </div>

            <span class="section-count">
              {{ projects.length }}
              {{ projects.length === 1 ? "projeto" : "projetos" }}
            </span>
          </div>

          <div
            v-if="loadingProjects"
            class="empty-state"
          >
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
              Informe uma pasta de workspace acima para
              detectar aplicações Rails e Node.
            </p>
          </div>

          <div
            v-else
            class="projects-grid"
          >
            <article
              v-for="project in sortedProjects"
              :key="project.id"
              class="project-card"
            >
              <div class="project-card-header">
                <div class="project-avatar">
                  {{ projectInitials(project.name) }}
                </div>

                <div class="project-identity">
                  <h3>{{ project.name }}</h3>

                  <div class="project-meta">
                    <span
                      class="type-badge"
                      :class="`type-badge-${project.type}`"
                    >
                      {{ typeLabel(project.type) }}
                    </span>

                    <span>
                      {{ project.source }}
                    </span>
                  </div>
                </div>

                <button
                  class="icon-button"
                  type="button"
                  title="Mais ações"
                  disabled
                >
                  •••
                </button>
              </div>

              <code class="project-path">
                {{ project.path }}
              </code>

              <div class="capabilities">
                <span
                  v-for="capability in project.capabilities"
                  :key="capability"
                  class="capability"
                >
                  {{ capabilityLabel(capability) }}
                </span>
              </div>

              <div class="project-card-footer">
                <span class="detected-status">
                  <span />
                  Detectado
                </span>

                <button
                  type="button"
                  class="secondary-button"
                  disabled
                >
                  Abrir projeto
                </button>
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  </div>
</template>
