<script setup lang="ts">
import {
  ArrowPathRoundedSquareIcon,
  DocumentTextIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref } from 'vue';

import type {
  GitFileStatus,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  prepareProjectGitUndo,
  undoProjectGitCommit,
  undoProjectGitFile,
} from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { gitFileToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview;
  busy: boolean;
}>();

const emit = defineEmits<{
  changed: [];
}>();

const running = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const activeView = ref<'commit' | 'files'>('commit');

const statusLabels: Record<GitFileStatus, string> = {
  added: 'Adicionado',
  modified: 'Modificado',
  deleted: 'Removido',
  renamed: 'Renomeado',
  copied: 'Copiado',
  untracked: 'Não rastreado',
  conflicted: 'Conflito',
  'type-changed': 'Tipo alterado',
};

const recentCommits = computed(() => props.overview.recentCommits.slice(0, 5));
const publishedLatestCommit = computed(
  () => Boolean(props.overview.upstream) && props.overview.ahead === 0,
);

const canUndoCommit = computed(
  () =>
    Boolean(props.overview.latestCommit) &&
    !props.overview.detached &&
    props.overview.clean &&
    !props.busy &&
    !running.value,
);

const commitActionLabel = computed(() =>
  publishedLatestCommit.value ? 'Reverter commit' : 'Desfazer commit',
);

const undoExplanation = computed(() => {
  if (publishedLatestCommit.value) {
    return 'Um novo commit inverso será criado sem reescrever o histórico.';
  }
  return 'O commit sai da branch e as alterações continuam disponíveis para edição.';
});

function clearFeedback(): void {
  errorMessage.value = '';
  successMessage.value = '';
}

function formatCommitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function isLatestCommit(hash: string): boolean {
  return props.overview.latestCommit?.hash === hash;
}

async function undoCommit(): Promise<void> {
  if (!canUndoCommit.value || !props.overview.latestCommit) return;

  const explanation = publishedLatestCommit.value
    ? 'O commit já foi publicado. O painel criará um novo commit de reversão sem reescrever o histórico.'
    : 'O commit será removido da branch e as alterações continuarão disponíveis para editar e commitar novamente.';
  const confirmed = await confirmDialog({
    title: `${commitActionLabel.value}?`,
    message: explanation,
    confirmLabel: commitActionLabel.value,
    tone: 'warning',
  });
  if (!confirmed) return;

  running.value = true;
  clearFeedback();
  try {
    const confirmation = await prepareProjectGitUndo(
      props.projectId,
      'commit',
      props.overview.branch ?? 'HEAD',
    );
    const result = await undoProjectGitCommit(
      props.projectId,
      confirmation.token,
    );
    successMessage.value =
      result.strategy === 'revert'
        ? `Commit ${result.undone.shortHash} revertido com um novo commit${result.result ? ` (${result.result.shortHash})` : ''}.`
        : `Commit ${result.undone.shortHash} desfeito. As alterações foram mantidas para edição.`;
    emit('changed');
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível desfazer o último commit.';
  } finally {
    running.value = false;
  }
}

async function undoFile(filePath: string): Promise<void> {
  if (props.busy || running.value) return;
  const confirmed = await confirmDialog({
    title: 'Desfazer alterações do arquivo?',
    message:
      `O arquivo "${filePath}" será restaurado para o estado do último commit. ` +
      'Arquivos novos serão removidos.',
    confirmLabel: 'Desfazer arquivo',
    tone: 'danger',
  });
  if (!confirmed) return;

  running.value = true;
  clearFeedback();
  try {
    const confirmation = await prepareProjectGitUndo(
      props.projectId,
      'file',
      filePath,
    );
    const restored = await undoProjectGitFile(
      props.projectId,
      filePath,
      confirmation.token,
    );
    successMessage.value = `Alterações de "${restored}" desfeitas.`;
    emit('changed');
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível desfazer as alterações do arquivo.';
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <section class="git-undo-page">
    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="git-undo-success" aria-live="polite">
      {{ successMessage }}
    </p>

    <div class="git-undo-mode" role="tablist" aria-label="Opções para desfazer">
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'commit'"
        :class="{ active: activeView === 'commit' }"
        @click="activeView = 'commit'"
      >
        <ArrowPathRoundedSquareIcon aria-hidden="true" />
        Desfazer commit
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeView === 'files'"
        :class="{ active: activeView === 'files' }"
        @click="activeView = 'files'"
      >
        <DocumentTextIcon aria-hidden="true" />
        Reverter arquivo
        <span v-if="overview.files.length" class="git-undo-mode-count">
          {{ overview.files.length }}
        </span>
      </button>
    </div>

    <section class="git-undo-card">
      <div v-show="activeView === 'commit'" class="git-undo-panel">
        <header class="git-undo-heading">
          <div>
            <h2>Commits recentes</h2>
            <p>Somente o último commit pode ser desfeito por esta tela.</p>
          </div>
        </header>

        <div v-if="recentCommits.length" class="git-undo-commits">
          <article
            v-for="commit in recentCommits"
            :key="commit.hash"
            class="git-undo-commit-row"
            :class="{ 'is-latest': isLatestCommit(commit.hash) }"
          >
            <code>{{ commit.shortHash }}</code>
            <div class="git-undo-commit-main">
              <strong>{{ commit.subject }}</strong>
              <small>
                {{ commit.authorName }} ·
                {{ formatCommitDate(commit.authoredAt) }}
              </small>
            </div>
            <span
              v-if="isLatestCommit(commit.hash)"
              class="git-undo-publication"
              :class="publishedLatestCommit ? 'is-published' : 'is-local'"
            >
              {{
                publishedLatestCommit ? 'Publicado no origin' : 'Commit local'
              }}
            </span>
            <button
              v-if="isLatestCommit(commit.hash)"
              type="button"
              class="git-undo-danger"
              :disabled="!canUndoCommit"
              @click="undoCommit"
            >
              <ArrowPathRoundedSquareIcon aria-hidden="true" />
              {{ running ? 'Processando…' : commitActionLabel }}
            </button>
          </article>
        </div>
        <div v-else class="git-undo-empty">Nenhum commit disponível.</div>

        <p
          v-if="overview.latestCommit && !overview.clean"
          class="git-undo-note"
        >
          Registre ou desfaça as alterações atuais antes de desfazer o commit.
        </p>

        <p class="git-undo-guidance">{{ undoExplanation }}</p>
      </div>

      <div v-show="activeView === 'files'" class="git-undo-panel">
        <header class="git-undo-heading">
          <div>
            <h2>Alterações locais</h2>
            <p>Restaure um arquivo para o estado do último commit.</p>
          </div>
        </header>

        <div v-if="overview.files.length" class="git-undo-files">
          <article v-for="file in overview.files" :key="file.path">
            <DocumentTextIcon aria-hidden="true" />
            <div>
              <code>{{ file.path }}</code>
              <StatusBadge :tone="gitFileToneFor(file.status)">
                {{ statusLabels[file.status] }}
              </StatusBadge>
            </div>
            <button
              type="button"
              class="git-undo-file-button"
              :disabled="busy || running"
              @click="undoFile(file.path)"
            >
              Reverter
            </button>
          </article>
        </div>
        <div v-else class="git-undo-empty">Nenhuma alteração local.</div>

        <p v-if="overview.files.length" class="git-undo-guidance is-danger">
          Reverter descarta as alterações locais do arquivo. Arquivos novos são
          removidos após a confirmação.
        </p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.git-undo-page {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  background: var(--surface-1);
}

.git-undo-page > .project-error,
.git-undo-success {
  flex: 0 0 auto;
  margin: 0;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
}

.git-undo-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.git-undo-mode {
  display: flex;
  width: 100%;
  min-height: 50px;
  flex: 0 0 auto;
  align-items: stretch;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.git-undo-mode button {
  position: relative;
  display: inline-flex;
  min-height: 50px;
  align-items: center;
  gap: 7px;
  padding: 0 16px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: var(--font-weight-strong);
}

.git-undo-mode button::after {
  position: absolute;
  right: 12px;
  bottom: 0;
  left: 12px;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: transparent;
  content: '';
}

.git-undo-mode button:hover {
  color: var(--text);
  background: var(--surface-2);
}

.git-undo-mode button.active {
  color: var(--accent);
}

.git-undo-mode button.active::after {
  background: var(--accent);
}

.git-undo-mode button > svg,
.git-undo-danger > svg {
  width: 16px;
  height: 16px;
}

.git-undo-mode-count {
  display: inline-grid;
  min-width: 20px;
  min-height: 20px;
  place-items: center;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
}

.git-undo-card {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.git-undo-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  overflow-y: auto;
}

.git-undo-heading {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.git-undo-heading > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.git-undo-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
}

.git-undo-heading p,
.git-undo-note,
.git-undo-guidance {
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.45;
}

.git-undo-commits,
.git-undo-files {
  display: grid;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface-1);
}

.git-undo-commit-row {
  display: grid;
  min-width: 0;
  min-height: 62px;
  grid-template-columns: 88px minmax(220px, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
}

.git-undo-commit-row:first-child,
.git-undo-files article:first-child {
  border-top: 0;
}

.git-undo-commit-row.is-latest {
  background: color-mix(in srgb, var(--accent-soft) 34%, transparent);
}

.git-undo-commit-row > code {
  width: max-content;
  padding: 3px 6px;
  border-radius: 7px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 10px;
}

.git-undo-commit-main {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.git-undo-commit-main strong,
.git-undo-commit-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-commit-main strong {
  color: var(--text);
  font-size: 11px;
}

.git-undo-commit-main small {
  color: var(--text-muted);
  font-size: 9px;
}

.git-undo-publication {
  display: inline-flex;
  width: max-content;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.git-undo-publication.is-published {
  color: var(--success-text);
  background: var(--success-surface);
}

.git-undo-publication.is-local {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-undo-danger,
.git-undo-file-button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--danger-text) 48%, var(--border));
  border-radius: var(--radius-sm);
  color: var(--danger-text, var(--text));
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.git-undo-danger:hover:not(:disabled),
.git-undo-file-button:hover:not(:disabled) {
  border-color: var(--danger-text);
  background: var(--danger-surface, var(--surface-2));
}

.git-undo-danger:disabled,
.git-undo-file-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.git-undo-note {
  flex: 0 0 auto;
  padding: 8px 10px;
  border-left: 3px solid var(--warning-text);
  color: var(--warning-text);
  background: var(--warning-surface);
}

.git-undo-guidance {
  flex: 0 0 auto;
  padding: 10px 0 0;
  border-top: 1px solid var(--border);
}

.git-undo-guidance.is-danger {
  color: var(--danger-text, var(--text-muted));
}

.git-undo-files article {
  display: flex;
  min-width: 0;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-top: 1px solid var(--border);
}

.git-undo-files article > svg {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--text-dim);
}

.git-undo-files article > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  margin-right: auto;
}

.git-undo-files code {
  overflow: hidden;
  color: var(--text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-empty {
  display: grid;
  min-height: 180px;
  place-items: center;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 10px;
}

@media (max-width: 900px) {
  .git-undo-commit-row {
    grid-template-columns: 82px minmax(180px, 1fr) auto;
  }

  .git-undo-danger {
    grid-column: 2 / -1;
    justify-self: end;
  }
}

@media (max-width: 720px) {
  .git-undo-mode {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .git-undo-mode button {
    justify-content: center;
    padding-inline: 10px;
  }

  .git-undo-panel {
    padding: 10px;
  }

  .git-undo-commit-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .git-undo-danger {
    grid-column: auto;
    width: 100%;
    justify-self: stretch;
  }

  .git-undo-files article {
    align-items: stretch;
    flex-direction: column;
  }

  .git-undo-files article > div {
    width: 100%;
    margin-right: 0;
  }

  .git-undo-file-button {
    width: 100%;
  }
}
</style>
