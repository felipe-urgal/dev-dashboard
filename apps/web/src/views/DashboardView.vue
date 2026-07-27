<script setup lang="ts">
import { ref } from 'vue';

import Card from '../components/Card.vue';
import ProjectCard from '../components/ProjectCard.vue';
import StatusBadge from '../components/StatusBadge.vue';
import WorkspaceDirectoryPicker from '../components/WorkspaceDirectoryPicker.vue';
import { dashboardStore } from '../stores/dashboard';

const directoryPickerOpen = ref(false);
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
    <section class="aurora-home-hero">
      <div class="aurora-home-glow" aria-hidden="true" />
      <div class="aurora-home-copy">
        <span class="aurora-pill">✦ AMBIENTE LOCAL SINCRONIZADO</span>
        <h2>Seu espaço para<br><em>criar sem atrito.</em></h2>
        <p>
          Projetos, processos e sinais do seu ecossistema local em uma
          experiência serena, contínua e pronta para o seu próximo fluxo.
        </p>
        <div class="aurora-hero-actions">
          <a class="aurora-action" href="#repositories">Explorar projetos <span>→</span></a>
          <span class="aurora-local-note"><i /> Seus dados permanecem neste dispositivo</span>
        </div>
      </div>

      <div class="aurora-overview" aria-label="Resumo do ambiente">
        <header>
          <div><span>Visão do ambiente</span><strong>{{ projects.length }} projetos ativos</strong></div>
          <span class="aurora-live"><i /> Ao vivo</span>
        </header>
        <div class="aurora-flow" aria-hidden="true">
          <span v-for="index in 12" :key="index" :style="{ height: `${22 + ((index * 17) % 68)}%` }" />
        </div>
        <footer>
          <div><span>Ruby</span><strong>{{ railsProjects }}</strong></div>
          <div><span>Node</span><strong>{{ nodeProjects }}</strong></div>
          <div><span>Git</span><strong>{{ gitProjects }}</strong></div>
        </footer>
      </div>
    </section>

    <div class="home-control-grid">

      <Card class="workspace-panel">
        <template #header>
          <div>
            <span class="section-kicker">Workspaces</span>
            <h3>Gerenciar projetos locais</h3>
          </div>
        </template>
        <template #actions>
          <StatusBadge tone="neutral">Somente local</StatusBadge>
        </template>

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
            <div class="workspace-path-picker-field">
              <input
                v-model="newWorkspacePath"
                autocomplete="off"
                placeholder="/home/usuario/projetos"
              />

              <button
                type="button"
                class="secondary-button"
                @click="directoryPickerOpen = true"
              >
                Escolher pasta
              </button>
            </div>
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
      </Card>

      <Card class="home-note-card">
        <span class="section-kicker">Princípio do protótipo</span>
        <h3>Futurista, sem perder o foco.</h3>
        <p>As três propostas preservam as ações reais do produto e variam apenas a hierarquia, o ritmo e a atmosfera visual.</p>
        <dl>
          <div><dt>Dados</dt><dd>100% locais</dd></div>
          <div><dt>Interface</dt><dd>3 direções</dd></div>
          <div><dt>Estado</dt><dd>Em exploração</dd></div>
        </dl>
      </Card>
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

    <section class="metrics-grid home-metrics-grid" aria-label="Resumo dos projetos">
      <Card tag="article" class="metric-card">
        <span class="metric-label">Repositórios</span>
        <strong>{{ projects.length }}</strong>
        <span class="metric-detail">projetos detectados</span>
      </Card>

      <Card tag="article" class="metric-card">
        <span class="metric-label">Rails</span>
        <strong>{{ railsProjects }}</strong>
        <span class="metric-detail">aplicações Ruby</span>
      </Card>

      <Card tag="article" class="metric-card">
        <span class="metric-label">Node</span>
        <strong>{{ nodeProjects }}</strong>
        <span class="metric-detail">aplicações JavaScript</span>
      </Card>

      <Card tag="article" class="metric-card">
        <span class="metric-label">Git</span>
        <strong>{{ gitProjects }}</strong>
        <span class="metric-detail">repositórios versionados</span>
      </Card>
    </section>

    <Card id="repositories" class="repositories-section">
      <template #header>
        <div>
          <span class="section-kicker">Repositórios</span>
          <h2>Projetos detectados</h2>
        </div>

      </template>
      <template #actions>
        <span class="section-count">
          {{ projects.length }}
          {{ projects.length === 1 ? 'projeto' : 'projetos' }}
        </span>
      </template>

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
    </Card>
    <WorkspaceDirectoryPicker
      v-model="newWorkspacePath"
      :open="directoryPickerOpen"
      @close="directoryPickerOpen = false"
    />
  </section>
</template>
