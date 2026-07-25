<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Project, ProjectGitOverview, GitFileStatus } from '@dev-dashboard/contracts';
import { fetchProjectGit } from '../api';

const props = defineProps<{ project: Project }>();
const overview = ref<ProjectGitOverview | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let generation = 0;

const statusLabels: Record<GitFileStatus, string> = {
  added: 'Adicionado', modified: 'Modificado', deleted: 'Removido', renamed: 'Renomeado', copied: 'Copiado', untracked: 'Não rastreado', conflicted: 'Conflito', 'type-changed': 'Tipo alterado',
};

const summary = computed(() => {
  const value = overview.value;
  if (!value?.repository) return 'Sem repositório Git';
  if (value.clean) return 'Árvore de trabalho limpa';
  return `${value.files.length} alteração${value.files.length === 1 ? '' : 'ões'}`;
});

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

async function loadGit(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchProjectGit(props.project.id);
    if (requestGeneration === generation) overview.value = result;
  } catch (error) {
    if (requestGeneration === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar o Git.';
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

watch(() => props.project.id, () => { overview.value = null; void loadGit(); }, { immediate: true });
</script>

<template>
  <section class="project-git-panel">
    <header class="git-panel-header">
      <div>
        <span class="section-kicker">Controle de versão</span>
        <h3>Git</h3>
        <p>{{ summary }}</p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading" @click="loadGit">
        {{ loading ? 'Atualizando...' : 'Atualizar' }}
      </button>
    </header>

    <div v-if="errorMessage" class="project-error" role="alert">{{ errorMessage }}</div>
    <div v-else-if="loading && !overview" class="git-empty-state">Consultando repositório...</div>
    <div v-else-if="overview && !overview.repository" class="git-empty-state">
      <strong>Este projeto não é um repositório Git.</strong>
      <span>Nenhum diretório <code>.git</code> foi encontrado.</span>
    </div>

    <template v-else-if="overview">
      <div class="git-metrics-grid">
        <article><span>Branch</span><strong>{{ overview.detached ? 'HEAD destacado' : (overview.branch ?? 'Sem commits') }}</strong><small>{{ overview.upstream ?? 'Sem upstream' }}</small></article>
        <article><span>Estado</span><strong>{{ overview.clean ? 'Limpo' : 'Alterado' }}</strong><small>{{ overview.files.length }} arquivo(s)</small></article>
        <article><span>Sincronização</span><strong>↑ {{ overview.ahead }} · ↓ {{ overview.behind }}</strong><small>ahead / behind</small></article>
      </div>

      <section class="git-section">
        <div class="details-card-heading"><div><span class="section-kicker">Working tree</span><h3>Alterações</h3></div></div>
        <div v-if="overview.files.length === 0" class="git-empty-inline">Nenhuma alteração local.</div>
        <ul v-else class="git-file-list">
          <li v-for="file in overview.files" :key="`${file.path}-${file.previousPath ?? ''}`">
            <span class="git-status-badge" :class="`git-status-${file.status}`">{{ statusLabels[file.status] }}</span>
            <code><template v-if="file.previousPath">{{ file.previousPath }} → </template>{{ file.path }}</code>
            <small>{{ file.indexStatus }}/{{ file.worktreeStatus }}</small>
          </li>
        </ul>
      </section>

      <section class="git-section">
        <div class="details-card-heading"><div><span class="section-kicker">Histórico</span><h3>Commits recentes</h3></div></div>
        <div v-if="overview.recentCommits.length === 0" class="git-empty-inline">O repositório ainda não possui commits.</div>
        <ol v-else class="git-commit-list">
          <li v-for="commit in overview.recentCommits" :key="commit.hash">
            <code>{{ commit.shortHash }}</code>
            <div><strong>{{ commit.subject }}</strong><span>{{ commit.authorName }} · {{ formatDate(commit.authoredAt) }}</span></div>
          </li>
        </ol>
      </section>
    </template>
  </section>
</template>
