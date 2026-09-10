<script setup lang="ts">
import {
  ArrowPathRoundedSquareIcon,
  ClockIcon,
  DocumentTextIcon,
  ShareIcon,
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
const commitQuery = ref('');

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
const filteredRecentCommits = computed(() => {
  const query = commitQuery.value.trim().toLocaleLowerCase('pt-BR');
  if (!query) return recentCommits.value;
  return recentCommits.value.filter((commit) =>
    [commit.shortHash, commit.subject, commit.authorName].some((value) =>
      value.toLocaleLowerCase('pt-BR').includes(query),
    ),
  );
});

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
  publishedLatestCommit.value
    ? 'Reverter commit publicado'
    : 'Desfazer último commit',
);

const branchState = computed(() => {
  if (!props.overview.upstream) {
    return { label: 'Sem remoto configurado', tone: 'neutral' };
  }
  if (props.overview.ahead > 0 && props.overview.behind > 0) {
    return { label: 'Divergente do origin', tone: 'warning' };
  }
  if (props.overview.behind > 0) {
    return {
      label: `${props.overview.behind} ${props.overview.behind === 1 ? 'commit atrás' : 'commits atrás'}`,
      tone: 'warning',
    };
  }
  if (props.overview.ahead > 0) {
    return {
      label: `${props.overview.ahead} ${props.overview.ahead === 1 ? 'commit à frente' : 'commits à frente'}`,
      tone: 'accent',
    };
  }
  return { label: 'Em dia com o origin', tone: 'success' };
});

const localChangesLabel = computed(() => {
  const count = props.overview.files.length;
  if (count === 0) return 'Nenhuma alteração local';
  return `${count} ${count === 1 ? 'arquivo alterado' : 'arquivos alterados'}`;
});

const undoExplanation = computed(() => {
  if (publishedLatestCommit.value) {
    return 'O painel cria um novo commit de reversão e mantém o histórico publicado intacto.';
  }
  return 'O commit local é removido da branch, mas as alterações continuam disponíveis para edição.';
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

    <div class="git-undo-summary" aria-label="Resumo para desfazer alterações">
      <article class="git-undo-summary-card">
        <div class="git-undo-summary-icon" aria-hidden="true">
          <ShareIcon />
        </div>
        <div>
          <span>Branch atual</span>
          <div class="git-undo-summary-value-line">
            <strong>{{ overview.branch ?? 'HEAD' }}</strong>
            <small class="git-undo-state" :class="`is-${branchState.tone}`">
              {{ branchState.label }}
            </small>
          </div>
          <small>Contexto onde a ação será aplicada</small>
        </div>
      </article>

      <article class="git-undo-summary-card">
        <div class="git-undo-summary-icon" aria-hidden="true">
          <ClockIcon />
        </div>
        <div>
          <span>Commits recentes</span>
          <strong>{{ overview.recentCommits.length }}</strong>
          <small>Carregados nesta visão</small>
        </div>
      </article>

      <article class="git-undo-summary-card">
        <div class="git-undo-summary-icon" aria-hidden="true">
          <DocumentTextIcon />
        </div>
        <div>
          <span>Alterações locais</span>
          <strong>{{ overview.files.length }}</strong>
          <small>{{ localChangesLabel }}</small>
        </div>
      </article>
    </div>

    <section class="git-undo-card">
      <div
        class="git-undo-mode"
        role="tablist"
        aria-label="Opções para desfazer"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'commit'"
          :class="{ active: activeView === 'commit' }"
          @click="activeView = 'commit'"
        >
          <ArrowPathRoundedSquareIcon aria-hidden="true" />
          Desfazer por commit
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeView === 'files'"
          :class="{ active: activeView === 'files' }"
          @click="activeView = 'files'"
        >
          <DocumentTextIcon aria-hidden="true" />
          Arquivos locais
          <span class="git-undo-mode-count">{{ overview.files.length }}</span>
        </button>
      </div>

      <div v-show="activeView === 'commit'" class="git-undo-panel">
        <header class="git-undo-heading">
          <div>
            <h2>{{ commitActionLabel }}</h2>
            <p>{{ undoExplanation }}</p>
          </div>
        </header>

        <article v-if="overview.latestCommit" class="git-undo-current-commit">
          <div class="git-undo-current-main">
            <code>{{ overview.latestCommit.shortHash }}</code>
            <div>
              <strong>{{ overview.latestCommit.subject }}</strong>
              <small>
                {{ overview.latestCommit.authorName }} ·
                {{ formatCommitDate(overview.latestCommit.authoredAt) }}
              </small>
            </div>
          </div>
          <span
            class="git-undo-publication"
            :class="publishedLatestCommit ? 'is-published' : 'is-local'"
          >
            {{ publishedLatestCommit ? 'Publicado no origin' : 'Commit local' }}
          </span>
          <button
            type="button"
            class="git-undo-danger"
            :disabled="!canUndoCommit"
            @click="undoCommit"
          >
            {{ running ? 'Processando…' : commitActionLabel }}
          </button>
        </article>
        <div v-else class="git-undo-empty">Nenhum commit disponível.</div>

        <p
          v-if="overview.latestCommit && !overview.clean"
          class="git-undo-note"
        >
          Registre ou desfaça as alterações atuais antes de desfazer o commit.
        </p>

        <section
          class="git-undo-history"
          aria-labelledby="git-undo-history-title"
        >
          <header>
            <div>
              <h3 id="git-undo-history-title">Contexto recente</h3>
              <p>
                Consulte os commits carregados. Por segurança, somente o último
                commit pode ser desfeito por esta tela.
              </p>
            </div>
            <label v-if="recentCommits.length > 1" class="git-undo-search">
              <span class="sr-only">Buscar commit recente</span>
              <input
                v-model="commitQuery"
                type="search"
                placeholder="Buscar por hash, mensagem ou autor…"
              />
            </label>
          </header>

          <div
            v-if="filteredRecentCommits.length"
            class="git-undo-history-table"
          >
            <div class="git-undo-history-head" aria-hidden="true">
              <span>Hash</span>
              <span>Mensagem</span>
              <span>Autor</span>
              <span>Data</span>
              <span>Estado</span>
            </div>
            <div
              v-for="commit in filteredRecentCommits"
              :key="commit.hash"
              class="git-undo-history-row"
              :class="{ 'is-latest': isLatestCommit(commit.hash) }"
            >
              <code>{{ commit.shortHash }}</code>
              <strong>{{ commit.subject }}</strong>
              <span>{{ commit.authorName }}</span>
              <time :datetime="commit.authoredAt">
                {{ formatCommitDate(commit.authoredAt) }}
              </time>
              <span
                v-if="isLatestCommit(commit.hash)"
                class="git-undo-latest-badge"
              >
                Último commit
              </span>
              <small v-else>Somente histórico</small>
            </div>
          </div>
          <p v-else class="git-undo-history-empty">
            Nenhum commit recente corresponde à busca.
          </p>
        </section>

        <aside class="git-undo-guidance">
          <strong>O que acontece?</strong>
          <p v-if="publishedLatestCommit">
            Reverter um commit publicado cria um novo commit inverso. O
            histórico existente não é reescrito.
          </p>
          <p v-else>
            Desfazer um commit local remove o commit da branch e mantém as
            alterações nos arquivos para você editar ou commitar novamente.
          </p>
        </aside>
      </div>

      <div v-show="activeView === 'files'" class="git-undo-panel">
        <header class="git-undo-heading">
          <div>
            <h2>Desfazer alterações de arquivos</h2>
            <p>
              Restaure arquivos individualmente para o estado do último commit.
            </p>
          </div>
          <small>{{ localChangesLabel }}</small>
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
              Desfazer arquivo
            </button>
          </article>
        </div>
        <div v-else class="git-undo-empty">
          Nenhum arquivo com alteração local.
        </div>

        <aside class="git-undo-warning">
          <strong>Atenção</strong>
          <p>
            Desfazer um arquivo descarta as alterações locais desse arquivo.
            Arquivos novos são removidos após a confirmação.
          </p>
        </aside>
      </div>
    </section>
  </section>
</template>

<style scoped>
.git-undo-page {
  display: grid;
  min-width: 0;
  gap: 18px;
  padding: var(--space-5);
}

.git-undo-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.git-undo-summary-card {
  display: flex;
  min-width: 0;
  min-height: 108px;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  padding: 16px 18px;
}

.git-undo-summary-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}

.git-undo-summary-icon svg {
  width: 22px;
  height: 22px;
}

.git-undo-summary-card > div:last-child {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.git-undo-summary-card span,
.git-undo-summary-card small {
  color: var(--text-muted);
}

.git-undo-summary-card strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-xl);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-summary-value-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.git-undo-state,
.git-undo-publication,
.git-undo-latest-badge {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: var(--font-xs);
  font-weight: 700;
  white-space: nowrap;
}

.git-undo-state.is-success,
.git-undo-publication.is-published {
  background: var(--success-surface);
  color: var(--success-text);
}

.git-undo-state.is-warning {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-undo-state.is-accent,
.git-undo-publication.is-local,
.git-undo-latest-badge {
  background: var(--accent-soft);
  color: var(--accent);
}

.git-undo-state.is-neutral {
  background: var(--surface-2);
  color: var(--text-muted);
}

.git-undo-card {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface-1);
}

.git-undo-mode {
  display: flex;
  min-height: 48px;
  border-bottom: 1px solid var(--border);
}

.git-undo-mode button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  padding: 0 18px;
  font: inherit;
  font-weight: 700;
}

.git-undo-mode button:hover {
  background: var(--surface-2);
  color: var(--text);
}

.git-undo-mode button.active {
  box-shadow: inset 0 -2px 0 var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.git-undo-mode button > svg {
  width: 18px;
  height: 18px;
}

.git-undo-mode-count {
  display: inline-grid;
  min-width: 20px;
  min-height: 20px;
  place-items: center;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  padding: 0 6px;
  font-size: var(--font-xs);
}

.git-undo-panel {
  display: grid;
  gap: 18px;
  padding: 18px;
}

.git-undo-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.git-undo-heading > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.git-undo-heading h2,
.git-undo-heading h3,
.git-undo-history h3 {
  margin: 0;
  color: var(--text);
}

.git-undo-heading h2 {
  font-size: var(--font-lg);
}

.git-undo-heading p,
.git-undo-heading small,
.git-undo-history p,
.git-undo-note,
.git-undo-guidance p,
.git-undo-warning p {
  margin: 0;
  color: var(--text-muted);
}

.git-undo-current-commit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  min-width: 0;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  padding: 14px 16px;
}

.git-undo-current-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.git-undo-current-main > code,
.git-undo-history-row > code {
  width: max-content;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
  padding: 3px 6px;
}

.git-undo-current-main > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.git-undo-current-main strong,
.git-undo-current-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-current-main strong {
  color: var(--text);
}

.git-undo-current-main small {
  color: var(--text-muted);
}

.git-undo-danger,
.git-undo-file-button {
  min-height: 38px;
  border: 1px solid var(--danger-border, var(--border));
  background: var(--surface-1);
  color: var(--danger-text, var(--text));
  padding: 8px 12px;
  font: inherit;
  font-weight: 700;
}

.git-undo-danger:hover:not(:disabled),
.git-undo-file-button:hover:not(:disabled) {
  background: var(--danger-surface, var(--surface-2));
}

.git-undo-danger:disabled,
.git-undo-file-button:disabled {
  opacity: 0.5;
}

.git-undo-note {
  border-left: 3px solid var(--warning-text);
  background: var(--warning-surface);
  padding: 10px 12px;
}

.git-undo-history {
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--border);
  padding-top: 18px;
}

.git-undo-history > header {
  display: flex;
  min-width: 0;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.git-undo-history > header > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.git-undo-history h3 {
  font-size: var(--font-base);
}

.git-undo-search {
  width: min(360px, 100%);
}

.git-undo-search input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: 0;
  background: var(--surface-2);
  color: var(--text);
  padding: 8px 11px;
  font: inherit;
}

.git-undo-search input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.git-undo-history-table {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.git-undo-history-head,
.git-undo-history-row {
  display: grid;
  grid-template-columns:
    110px minmax(220px, 2fr) minmax(130px, 1fr)
    130px 130px;
  min-width: 760px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}

.git-undo-history-table {
  overflow-x: auto;
}

.git-undo-history-head {
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: var(--font-xs);
  font-weight: 700;
}

.git-undo-history-row {
  border-top: 1px solid var(--border);
  color: var(--text-muted);
}

.git-undo-history-row.is-latest {
  background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
}

.git-undo-history-row strong {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-history-row small {
  color: var(--text-dim);
}

.git-undo-history-empty,
.git-undo-empty {
  margin: 0;
  background: var(--surface-2);
  color: var(--text-muted);
  padding: var(--space-3);
}

.git-undo-guidance,
.git-undo-warning {
  display: grid;
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  padding: 12px 14px;
}

.git-undo-guidance strong {
  color: var(--accent);
}

.git-undo-warning {
  border-color: var(--danger-border, var(--border));
  background: var(--danger-surface, var(--surface-2));
}

.git-undo-warning strong {
  color: var(--danger-text, var(--text));
}

.git-undo-files {
  display: grid;
  gap: var(--space-2);
}

.git-undo-files article {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  padding: 12px 14px;
}

.git-undo-files article > svg {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--text-dim);
}

.git-undo-files article > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  margin-right: auto;
}

.git-undo-files code {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-success {
  margin: 0;
  background: var(--success-surface);
  color: var(--success-text);
  padding: var(--space-3);
}

@media (max-width: 980px) {
  .git-undo-summary {
    grid-template-columns: 1fr;
  }

  .git-undo-summary-card {
    min-height: 88px;
  }

  .git-undo-current-commit {
    grid-template-columns: 1fr auto;
  }

  .git-undo-current-commit .git-undo-danger {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .git-undo-page {
    padding: var(--space-3);
  }

  .git-undo-mode {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .git-undo-mode button {
    justify-content: center;
    border-right: 0;
  }

  .git-undo-history > header,
  .git-undo-heading,
  .git-undo-files article {
    align-items: stretch;
    flex-direction: column;
  }

  .git-undo-search {
    width: 100%;
  }

  .git-undo-current-commit {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .git-undo-current-commit .git-undo-danger {
    grid-column: auto;
  }

  .git-undo-files article > div {
    width: 100%;
    margin-right: 0;
  }
}
</style>
