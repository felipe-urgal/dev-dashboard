<script setup lang="ts">
import ProjectCard from '../components/ProjectCard.vue';
import { dashboardStore } from '../stores/dashboard';

const {
  projects,
  workspaces,
  selectedWorkspaceId,
  newWorkspaceName,
  newWorkspacePath,
  loadingProjects,
  scanningWorkspace,
  creatingWorkspace,
  deletingWorkspace,
  errorMessage,
  successMessage,
  warningCount,
  lastScannedPath,
  selectedWorkspace,
  railsProjects,
  nodeProjects,
  gitProjects,
  sortedProjects,
  scanSelectedWorkspace,
  handleWorkspaceSelection,
  handleCreateWorkspace,
  handleDeleteWorkspace,
} = dashboardStore;
</script>

<template>
  <section id="overview" class="content">
    <div class="hero-grid">
      <div class="hero-copy">
        <span class="section-kicker">Central de desenvolvimento</span>
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
            <span class="section-kicker">Workspaces</span>
            <h3>Gerenciar projetos locais</h3>
          </div>
          <span class="local-badge">Local only</span>
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

    <div v-if="errorMessage" class="alert alert-error" role="alert">
      <strong>Não foi possível concluir a ação.</strong>
      <span>{{ errorMessage }}</span>
    </div>

    <div v-if="successMessage" class="alert alert-success" role="status">
      <strong>Ação concluída.</strong>
      <span>{{ successMessage }}</span>
    </div>

    <div v-if="warningCount > 0" class="alert alert-warning">
      <strong>Scan concluído com avisos.</strong>
      <span>
        {{ warningCount }} diretório(s) não puderam ser analisados.
      </span>
    </div>

    <div v-if="lastScannedPath" class="scan-result">
      Workspace carregado:
      <code>{{ lastScannedPath }}</code>
    </div>

    <section class="metrics-grid" aria-label="Resumo dos projetos">
      <article class="metric-card">
        <span class="metric-label">Repositórios</span>
        <strong>{{ projects.length }}</strong>
        <span class="metric-detail">projetos detectados</span>
      </article>

      <article class="metric-card">
        <span class="metric-label">Rails</span>
        <strong>{{ railsProjects }}</strong>
        <span class="metric-detail">aplicações Ruby</span>
      </article>

      <article class="metric-card">
        <span class="metric-label">Node</span>
        <strong>{{ nodeProjects }}</strong>
        <span class="metric-detail">aplicações JavaScript</span>
      </article>

      <article class="metric-card">
        <span class="metric-label">Git</span>
        <strong>{{ gitProjects }}</strong>
        <span class="metric-detail">repositórios versionados</span>
      </article>
    </section>

    <section id="repositories" class="repositories-section">
      <div class="section-heading">
        <div>
          <span class="section-kicker">Repositórios</span>
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
</template>
