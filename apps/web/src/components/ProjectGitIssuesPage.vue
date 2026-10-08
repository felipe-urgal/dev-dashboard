<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { NModal } from 'naive-ui';
import { onBeforeUnmount, ref, watch } from 'vue';

import {
  closeProjectGithubIssue,
  createProjectGithubIssue,
  fetchProjectGithubIssues,
  updateProjectGithubIssue,
  type GithubIssue,
} from '../api/github-issues';
import { confirmDialog } from '../stores/app-dialog';

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
const title = ref('');
const body = ref('');
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
  title.value = '';
  body.value = '';
  actionError.value = '';
  modal.value = 'create';
}

function openEdit(issue: GithubIssue): void {
  selectedIssue.value = issue;
  title.value = issue.title;
  body.value = issue.body;
  actionError.value = '';
  modal.value = 'edit';
}

function closeModal(): void {
  if (busy.value) return;
  modal.value = null;
  selectedIssue.value = null;
}

function handleModalVisibility(show: boolean): void {
  if (!show) closeModal();
}

async function saveIssue(): Promise<void> {
  if (busy.value || !title.value.trim() || title.value.length > 256) return;
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
      const issue = await createProjectGithubIssue(
        projectId,
        title.value.trim(),
        body.value,
      );
      if (projectId !== props.projectId) return;
      actionMessage.value = 'Issue #' + issue.number + ' criada.';
      state.value = 'open';
      page.value = 1;
    } else {
      const issue = await updateProjectGithubIssue(
        projectId,
        number!,
        title.value.trim(),
        body.value,
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

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}
</script>

<template>
  <section class="git-issues-page">
    <header class="git-issues-toolbar">
      <div
        class="git-issues-filters"
        role="group"
        aria-label="Estado das issues"
      >
        <button
          type="button"
          :class="{ active: state === 'open' }"
          :aria-pressed="state === 'open'"
          :disabled="busy"
          @click="selectState('open')"
        >
          Abertas
        </button>
        <button
          type="button"
          :class="{ active: state === 'closed' }"
          :aria-pressed="state === 'closed'"
          :disabled="busy"
          @click="selectState('closed')"
        >
          Fechadas
        </button>
      </div>
      <div class="git-issues-actions">
        <button
          type="button"
          class="secondary-button"
          :disabled="busy || loading"
          aria-label="Atualizar issues"
          @click="loadIssues"
        >
          <ArrowPathIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          class="primary-button"
          :disabled="busy"
          @click="openCreate"
        >
          <PlusIcon aria-hidden="true" /> Nova issue
        </button>
      </div>
    </header>

    <p v-if="repository" class="git-issues-repository">{{ repository }}</p>
    <p v-if="actionMessage" class="git-mutation-success" role="status">
      {{ actionMessage }}
    </p>
    <p v-if="loadError" class="project-error" role="alert">{{ loadError }}</p>
    <p v-if="actionError && !modal" class="project-error" role="alert">
      {{ actionError }}
    </p>

    <div class="git-issues-list" :aria-busy="loading">
      <div v-if="loading" class="git-issues-empty">Consultando issues…</div>
      <div
        v-else-if="!loadError && issues.length === 0"
        class="git-issues-empty"
      >
        Nenhuma issue {{ state === 'open' ? 'aberta' : 'fechada' }} nesta
        página.
      </div>

      <article
        v-for="issue in loading ? [] : issues"
        :key="issue.number"
        class="git-issue-row"
      >
        <div class="git-issue-details">
          <a
            :href="issue.url"
            target="_blank"
            rel="noopener noreferrer"
            class="git-issue-title"
          >
            #{{ issue.number }} · {{ issue.title }}
            <ArrowTopRightOnSquareIcon aria-hidden="true" />
          </a>
          <div class="git-issue-meta">
            <span v-if="issue.author">por {{ issue.author }}</span>
            <span v-if="issue.updatedAt"
              >atualizada em {{ formatDate(issue.updatedAt) }}</span
            >
            <span
              v-for="label in issue.labels"
              :key="label"
              class="git-issue-label"
            >
              {{ label }}
            </span>
          </div>
        </div>
        <div class="git-issue-row-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="openEdit(issue)"
          >
            <PencilSquareIcon aria-hidden="true" /> Editar
          </button>
          <button
            v-if="issue.state === 'open'"
            type="button"
            class="secondary-button"
            :disabled="busy"
            @click="closeIssue(issue)"
          >
            Fechar
          </button>
        </div>
      </article>
    </div>

    <footer
      v-if="!loadError && !loading && (page > 1 || hasMore)"
      class="git-issues-pagination"
    >
      <button
        type="button"
        class="secondary-button"
        :disabled="busy || page === 1"
        @click="page -= 1"
      >
        Anterior
      </button>
      <span>Página {{ page }}</span>
      <button
        type="button"
        class="secondary-button"
        :disabled="busy || !hasMore"
        @click="page += 1"
      >
        Próxima
      </button>
    </footer>

    <NModal
      :show="modal !== null"
      :mask-closable="!busy"
      :close-on-esc="!busy"
      @update:show="handleModalVisibility"
    >
      <section
        class="git-issue-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-issue-modal-title"
      >
        <header>
          <h2 id="git-issue-modal-title">
            {{
              modal === 'create'
                ? 'Nova issue'
                : 'Editar issue #' + selectedIssue?.number
            }}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            :disabled="busy"
            @click="closeModal"
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </header>

        <form @submit.prevent="saveIssue">
          <label>
            <span>Título</span>
            <input
              v-model="title"
              type="text"
              maxlength="256"
              required
              autofocus
              :disabled="busy"
            />
          </label>
          <label>
            <span>Descrição (Markdown)</span>
            <textarea
              v-model="body"
              rows="8"
              maxlength="20000"
              :disabled="busy"
            />
          </label>
          <p v-if="actionError" class="project-error" role="alert">
            {{ actionError }}
          </p>
          <footer>
            <button
              type="button"
              class="secondary-button"
              :disabled="busy"
              @click="closeModal"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="primary-button"
              :disabled="busy || !title.trim()"
            >
              {{
                busy
                  ? 'Salvando…'
                  : modal === 'create'
                    ? 'Criar issue'
                    : 'Salvar alterações'
              }}
            </button>
          </footer>
        </form>
      </section>
    </NModal>
  </section>
</template>

<style scoped>
.git-issues-page {
  display: grid;
  align-content: start;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
}

.git-issues-toolbar,
.git-issues-actions,
.git-issues-filters,
.git-issue-row,
.git-issue-row-actions,
.git-issues-pagination,
.git-issue-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.git-issues-toolbar,
.git-issue-row {
  justify-content: space-between;
}

.git-issues-toolbar {
  flex-wrap: wrap;
}

.git-issues-filters {
  border: 1px solid var(--border);
  padding: 3px;
}

.git-issues-filters button {
  border: 0;
  padding: 7px 12px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
}

.git-issues-filters button.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}

.git-issues-actions svg,
.git-issue-row-actions svg {
  width: 16px;
  height: 16px;
}

.git-issues-actions button,
.git-issue-row-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.git-issues-repository {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-issues-list {
  border: 1px solid var(--border);
}

.git-issue-row {
  min-width: 0;
  padding: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.git-issue-row:last-child {
  border-bottom: 0;
}

.git-issue-details {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.git-issue-title {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 5px;
  color: var(--text);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.git-issue-title svg {
  width: 14px;
  height: 14px;
  flex: none;
}

.git-issue-meta {
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.git-issue-label {
  border: 1px solid var(--border);
  background: var(--surface-2);
  padding: 2px 6px;
}

.git-issue-row-actions {
  flex: none;
}

.git-issues-empty {
  padding: var(--space-5);
  color: var(--text-muted);
  text-align: center;
}

.git-issues-pagination {
  justify-content: center;
}

.git-issue-modal {
  display: grid;
  width: min(600px, calc(100vw - 32px));
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--surface-1);
  border: 1px solid var(--border);
  color: var(--text);
}

.git-issue-modal header,
.git-issue-modal form footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.git-issue-modal h2 {
  margin: 0;
  font-size: var(--font-xl);
}

.git-issue-modal header button {
  background: none;
  border: 0;
  color: var(--text-muted);
}

.git-issue-modal header svg {
  width: 20px;
  height: 20px;
}

.git-issue-modal form,
.git-issue-modal label {
  display: grid;
  gap: var(--space-3);
}

.git-issue-modal label {
  gap: 5px;
  font-weight: 600;
}

.git-issue-modal input,
.git-issue-modal textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
}

.git-issue-modal textarea {
  resize: vertical;
}

@media (max-width: 680px) {
  .git-issue-row {
    align-items: stretch;
    flex-direction: column;
  }

  .git-issue-row-actions {
    align-self: flex-start;
  }
}
</style>
