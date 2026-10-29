<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  closeProjectGithubIssue,
  createProjectGithubIssue,
  fetchProjectGithubIssues,
  removeProjectGithubIssue,
  reopenProjectGithubIssue,
  updateProjectGithubIssue,
  type GithubIssue,
} from '../api/github-issues';
import { confirmDialog } from '../stores/app-dialog';
import GitIssueDialog from './git-issues/GitIssueDialog.vue';
import GitIssueRow from './git-issues/GitIssueRow.vue';
import UiButton from './ui/UiButton.vue';
import UiSearchField from './ui/UiSearchField.vue';

const props = defineProps<{ projectId: string }>();

const state = ref<'open' | 'closed'>('open');
const page = ref(1);
const issues = ref<GithubIssue[]>([]);
const repository = ref('');
const hasMore = ref(false);
const loading = ref(false);
const busy = ref(false);
const loadError = ref('');
const actionError = ref('');
const actionMessage = ref('');

const modal = ref<'create' | 'edit' | null>(null);
const selectedIssue = ref<GithubIssue | null>(null);
const query = ref('');
let generation = 0;

async function loadIssues(): Promise<void> {
  const current = ++generation;
  const projectId = props.projectId;
  loading.value = true;
  loadError.value = '';

  try {
    const result = await fetchProjectGithubIssues(
      projectId,
      state.value,
      page.value,
    );
    if (current !== generation || projectId !== props.projectId) return;
    issues.value = result.issues;
    repository.value = result.repository;
    hasMore.value = result.hasMore;
  } catch (error) {
    if (current !== generation) return;
    issues.value = [];
    hasMore.value = false;
    loadError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível listar issues.';
  } finally {
    if (current === generation) loading.value = false;
  }
}

watch(
  [() => props.projectId, state, page],
  () => {
    void loadIssues();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  generation += 1;
});

watch(
  () => props.projectId,
  () => {
    modal.value = null;
    selectedIssue.value = null;
    actionError.value = '';
    actionMessage.value = '';
    state.value = 'open';
    page.value = 1;
  },
);

function selectState(next: 'open' | 'closed'): void {
  if (busy.value || state.value === next) return;
  state.value = next;
  page.value = 1;
}

function openCreate(): void {
  selectedIssue.value = null;
  actionError.value = '';
  modal.value = 'create';
}

function openEdit(issue: GithubIssue): void {
  selectedIssue.value = issue;
  actionError.value = '';
  modal.value = 'edit';
}

function closeModal(): void {
  if (busy.value) return;
  modal.value = null;
  selectedIssue.value = null;
}

async function saveIssue(title: string, body: string): Promise<void> {
  if (busy.value || !title) return;
  const operation = modal.value;
  if (!operation) return;
  const number = selectedIssue.value?.number;
  const projectId = props.projectId;
  if (operation === 'edit' && number === undefined) return;

  busy.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    if (operation === 'create') {
      const issue = await createProjectGithubIssue(projectId, title, body);
      if (projectId !== props.projectId) return;
      actionMessage.value = 'Issue #' + issue.number + ' criada.';
      state.value = 'open';
      page.value = 1;
    } else {
      const issue = await updateProjectGithubIssue(
        projectId,
        number!,
        title,
        body,
      );
      if (projectId !== props.projectId) return;
      actionMessage.value = 'Issue #' + issue.number + ' atualizada.';
    }
    modal.value = null;
    selectedIssue.value = null;
    await loadIssues();
  } catch (error) {
    if (projectId !== props.projectId) return;
    actionError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar a issue.';
  } finally {
    busy.value = false;
  }
}

async function closeIssue(issue: GithubIssue): Promise<void> {
  if (busy.value || issue.state !== 'open') return;
  const projectId = props.projectId;
  const confirmed = await confirmDialog({
    title: 'Fechar issue #' + issue.number + '?',
    message:
      'A issue será marcada como fechada no GitHub. Seu histórico será preservado.',
    confirmLabel: 'Fechar issue',
    tone: 'warning',
  });
  if (!confirmed || busy.value || projectId !== props.projectId) return;

  busy.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    await closeProjectGithubIssue(projectId, issue.number);
    if (projectId !== props.projectId) return;
    actionMessage.value = 'Issue #' + issue.number + ' fechada.';
    await loadIssues();
  } catch (error) {
    if (projectId !== props.projectId) return;
    actionError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível fechar a issue.';
  } finally {
    busy.value = false;
  }
}

async function reopenIssue(issue: GithubIssue): Promise<void> {
  if (busy.value || issue.state !== 'closed') return;
  const projectId = props.projectId;

  busy.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    await reopenProjectGithubIssue(projectId, issue.number);
    if (projectId !== props.projectId) return;
    actionMessage.value = 'Issue #' + issue.number + ' reaberta.';
    await loadIssues();
  } catch (error) {
    if (projectId !== props.projectId) return;
    actionError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível reabrir a issue.';
  } finally {
    busy.value = false;
  }
}

async function removeIssue(issue: GithubIssue): Promise<void> {
  if (busy.value) return;
  const projectId = props.projectId;
  const confirmed = await confirmDialog({
    title: 'Remover issue #' + issue.number + '?',
    message:
      'A issue "' +
      issue.title +
      '" será apagada do GitHub, com comentários e histórico. Esta ação não pode ser desfeita. Para só encerrá-la, use Fechar.',
    confirmLabel: 'Remover issue',
    tone: 'danger',
  });
  if (!confirmed || busy.value || projectId !== props.projectId) return;

  busy.value = true;
  actionError.value = '';
  actionMessage.value = '';
  try {
    await removeProjectGithubIssue(projectId, issue.number);
    if (projectId !== props.projectId) return;
    actionMessage.value = 'Issue #' + issue.number + ' removida.';
    await loadIssues();
  } catch (error) {
    if (projectId !== props.projectId) return;
    actionError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover a issue.';
  } finally {
    busy.value = false;
  }
}

const filtered = computed(() => {
  const term = query.value.trim().toLowerCase().replace(/^#/u, '');
  if (!term) return issues.value;
  return issues.value.filter(
    (issue) =>
      String(issue.number).includes(term) ||
      issue.title.toLowerCase().includes(term) ||
      issue.author.toLowerCase().includes(term) ||
      issue.labels.some((label) => label.toLowerCase().includes(term)),
  );
});

const repositoryUrl = computed(() =>
  repository.value ? 'https://github.com/' + repository.value : '',
);
</script>

<template>
  <section class="git-issues-page">
    <div class="git-issues-toolbar">
      <UiSearchField
        v-model="query"
        label="Buscar issue"
        placeholder="Buscar por título, #número, autor ou label"
      />

      <div
        class="git-issues-filters"
        role="group"
        aria-label="Estado das issues"
      >
        <button
          type="button"
          :aria-pressed="state === 'open'"
          :disabled="busy"
          @click="selectState('open')"
        >
          Abertas
        </button>
        <button
          type="button"
          :aria-pressed="state === 'closed'"
          :disabled="busy"
          @click="selectState('closed')"
        >
          Fechadas
        </button>
      </div>

      <a
        v-if="repositoryUrl"
        class="git-issues-repository"
        :href="repositoryUrl + '/issues'"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ repository }}
        <ArrowTopRightOnSquareIcon aria-hidden="true" />
      </a>

      <span class="git-issues-spacer" />

      <UiButton
        icon
        variant="ghost"
        aria-label="Atualizar issues"
        :disabled="busy || loading"
        @click="loadIssues"
      >
        <ArrowPathIcon aria-hidden="true" />
      </UiButton>
      <UiButton variant="primary" :disabled="busy" @click="openCreate">
        <PlusIcon aria-hidden="true" />
        Nova issue
      </UiButton>
    </div>

    <p v-if="actionMessage" class="git-mutation-success" role="status">
      {{ actionMessage }}
    </p>
    <p v-if="actionError && !modal" class="project-error" role="alert">
      {{ actionError }}
    </p>

    <div v-if="loadError" class="git-issues-note" role="alert">
      <p>{{ loadError }}</p>
      <UiButton :disabled="loading" @click="loadIssues">
        Tentar novamente
      </UiButton>
    </div>

    <div v-else-if="loading" class="git-issues-note" aria-busy="true">
      Consultando issues…
    </div>

    <div v-else-if="issues.length === 0" class="git-issues-note">
      <p>
        Nenhuma issue {{ state === 'open' ? 'aberta' : 'fechada' }}
        {{ page > 1 ? 'nesta página' : 'em ' + repository }}.
      </p>
      <UiButton
        v-if="state === 'open'"
        variant="primary"
        :disabled="busy"
        @click="openCreate"
      >
        <PlusIcon aria-hidden="true" />
        Criar a primeira issue
      </UiButton>
    </div>

    <div v-else-if="filtered.length === 0" class="git-issues-note">
      Nenhuma issue corresponde a “{{ query }}” nesta página.
    </div>

    <section v-else class="git-issues-section">
      <header>
        {{ state === 'open' ? 'Abertas' : 'Fechadas' }}
        <span>
          {{ filtered.length }}
          {{ filtered.length === 1 ? 'issue' : 'issues' }}
          {{ query.trim() ? 'filtradas' : 'nesta página' }}
        </span>
      </header>
      <GitIssueRow
        v-for="issue in filtered"
        :key="issue.number"
        :issue="issue"
        :disabled="busy"
        @edit="openEdit(issue)"
        @close="closeIssue(issue)"
        @reopen="reopenIssue(issue)"
        @remove="removeIssue(issue)"
      />
    </section>

    <footer
      v-if="!loadError && !loading && (page > 1 || hasMore)"
      class="git-issues-pagination"
    >
      <UiButton :disabled="busy || page === 1" @click="page -= 1">
        Anterior
      </UiButton>
      <span>Página {{ page }}</span>
      <UiButton :disabled="busy || !hasMore" @click="page += 1">
        Próxima
      </UiButton>
    </footer>

    <GitIssueDialog
      :mode="modal"
      :issue="selectedIssue"
      :busy="busy"
      :error="actionError"
      @close="closeModal"
      @save="saveIssue"
    />
  </section>
</template>

<style scoped>
.git-issues-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.git-issues-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.git-issues-toolbar :deep(.ui-search) {
  width: 340px;
  max-width: 100%;
}

.git-issues-filters {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.git-issues-filters button {
  height: 32px;
  padding: 0 12px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.git-issues-filters button + button {
  border-left: 1px solid var(--border-strong);
}

.git-issues-filters button[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-issues-repository {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  text-decoration: none;
}

.git-issues-repository:hover {
  color: var(--text);
}

.git-issues-repository svg {
  width: 14px;
  height: 14px;
}

.git-issues-spacer {
  flex: 1 1 0;
}

.git-issues-note {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  background: var(--surface-1);
  text-align: center;
}

.git-issues-note p {
  margin: 0;
}

.git-issues-section {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-issues-section > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 650;
}

.git-issues-section > header span {
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 500;
}

.git-issues-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
