<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  DocumentTextIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { computed, onMounted, ref, watch } from 'vue';

import type {
  GitFileChange,
  GitFileStatus,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  discardProjectGitFile,
  getProjectGitUndoStatus,
  prepareProjectGitMutation,
  prepareProjectGitUndo,
  removeProjectGitUntrackedFile,
  undoProjectGitCommit,
  undoProjectGitFile,
  unstageProjectGitFile,
  type GitUndoCommitStatus,
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

type UndoOperationKind =
  | 'commit'
  | 'unstage'
  | 'discard'
  | 'remove'
  | 'restore';

const activeView = ref<'commit' | 'files'>('commit');
const activeOperation = ref<{ kind: UndoOperationKind; path?: string } | null>(
  null,
);
const commitStatus = ref<GitUndoCommitStatus | null>(null);
const loadingCommitStatus = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

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
const running = computed(() => activeOperation.value !== null);

const commitActionLabel = computed(() =>
  commitStatus.value?.strategy === 'revert'
    ? 'Reverter commit'
    : 'Desfazer commit',
);

const canUndoCommit = computed(
  () =>
    Boolean(commitStatus.value?.available) &&
    !props.busy &&
    !running.value &&
    !loadingCommitStatus.value,
);

const commitStateLabel = computed(() => {
  const status = commitStatus.value;
  if (!status) return loadingCommitStatus.value ? 'Verificando…' : 'Indisponível';
  if (status.available && status.strategy === 'revert')
    return 'Publicado no remoto';
  if (status.available && status.strategy === 'reset') return 'Commit local';
  switch (status.reason) {
    case 'behind':
      return 'Sincronização necessária';
    case 'diverged':
      return 'Branch divergente';
    case 'dirty':
      return 'Alterações locais pendentes';
    case 'first-commit':
      return 'Primeiro commit';
    case 'detached':
      return 'HEAD destacado';
    case 'no-commit':
      return 'Sem commit';
    default:
      return 'Indisponível';
  }
});

const undoExplanation = computed(() => {
  const status = commitStatus.value;
  if (!status) return 'Verificando se o último commit pode ser desfeito.';
  if (status.available && status.strategy === 'revert') {
    return 'O commit já está no remoto. Um novo commit inverso será criado localmente e ficará aguardando Push.';
  }
  if (status.available && status.strategy === 'reset') {
    return 'O commit será removido da branch com reset soft e suas alterações ficarão staged para edição ou novo commit.';
  }
  switch (status.reason) {
    case 'behind':
      return `A branch está atrás de ${status.reference ?? 'seu remoto'}. Sincronize antes de desfazer o commit.`;
    case 'diverged':
      return `A branch divergiu de ${status.reference ?? 'seu remoto'}. Resolva a divergência antes de desfazer o commit.`;
    case 'dirty':
      return 'Registre ou desfaça as alterações locais atuais antes de desfazer o commit.';
    case 'first-commit':
      return 'O primeiro commit do repositório não pode ser desfeito por esta ação.';
    case 'detached':
      return 'Selecione uma branch antes de desfazer commits.';
    default:
      return 'Nenhum commit está disponível para desfazer.';
  }
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

function hasStaged(file: GitFileChange): boolean {
  return file.indexStatus !== '.' && file.indexStatus !== '?';
}

function hasWorktreeChange(file: GitFileChange): boolean {
  return file.worktreeStatus !== '.' && file.worktreeStatus !== '?';
}

function isSpecialRestore(file: GitFileChange): boolean {
  return ['renamed', 'copied', 'conflicted'].includes(file.status);
}

function operationFor(kind: UndoOperationKind, file?: GitFileChange): boolean {
  return (
    activeOperation.value?.kind === kind &&
    (!file || activeOperation.value.path === file.path)
  );
}

async function loadCommitStatus(): Promise<void> {
  const projectId = props.projectId;
  loadingCommitStatus.value = true;
  try {
    const status = await getProjectGitUndoStatus(projectId);
    if (projectId === props.projectId) commitStatus.value = status;
  } catch (error) {
    if (projectId === props.projectId) {
      commitStatus.value = null;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível verificar o último commit.';
    }
  } finally {
    if (projectId === props.projectId) loadingCommitStatus.value = false;
  }
}

async function finishMutation(
  operation: { kind: UndoOperationKind; path?: string },
  action: () => Promise<void>,
): Promise<void> {
  if (props.busy || running.value) return;
  activeOperation.value = operation;
  clearFeedback();
  try {
    await action();
    emit('changed');
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Não foi possível desfazer.';
  } finally {
    activeOperation.value = null;
    await loadCommitStatus();
  }
}

async function undoCommit(): Promise<void> {
  if (!canUndoCommit.value || !props.overview.latestCommit) return;
  const revert = commitStatus.value?.strategy === 'revert';
  const confirmed = await confirmDialog({
    title: `${commitActionLabel.value}?`,
    message: revert
      ? 'Será criado um novo commit que inverte o último commit. O histórico não será reescrito e a reversão ficará aguardando Push.'
      : 'O último commit será removido com reset soft. Todos os arquivos desse commit continuarão staged.',
    confirmLabel: commitActionLabel.value,
    tone: 'warning',
  });
  if (!confirmed) return;

  await finishMutation({ kind: 'commit' }, async () => {
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
        ? `Reversão de ${result.undone.shortHash} criada${result.result ? ` como ${result.result.shortHash}` : ''}. Faça Push para publicar.`
        : `Commit ${result.undone.shortHash} desfeito. As alterações ficaram staged.`;
  });
}

async function unstageFile(file: GitFileChange): Promise<void> {
  await finishMutation({ kind: 'unstage', path: file.path }, async () => {
    await unstageProjectGitFile(props.projectId, file.path);
    successMessage.value =
      file.status === 'renamed'
        ? `Rename "${file.previousPath ?? ''} → ${file.path}" removido do staged sem apagar os arquivos.`
        : `"${file.path}" removido do staged sem perder conteúdo.`;
  });
}

async function discardFile(file: GitFileChange): Promise<void> {
  const confirmed = await confirmDialog({
    title: 'Descartar alterações locais?',
    message: `As alterações não staged de "${file.path}" serão descartadas. Alterações já staged serão preservadas.`,
    confirmLabel: 'Descartar alterações',
    tone: 'danger',
  });
  if (!confirmed) return;

  await finishMutation({ kind: 'discard', path: file.path }, async () => {
    const confirmation = await prepareProjectGitMutation(
      props.projectId,
      'discard-file',
      file.path,
    );
    await discardProjectGitFile(
      props.projectId,
      file.path,
      confirmation.token,
    );
    successMessage.value = `Alterações não staged de "${file.path}" descartadas.`;
  });
}

async function removeUntracked(file: GitFileChange): Promise<void> {
  const confirmed = await confirmDialog({
    title: 'Excluir arquivo não rastreado?',
    message: `O arquivo "${file.path}" será excluído permanentemente. O Git não possui uma versão anterior para restaurar.`,
    confirmLabel: 'Excluir arquivo',
    tone: 'danger',
  });
  if (!confirmed) return;

  await finishMutation({ kind: 'remove', path: file.path }, async () => {
    const confirmation = await prepareProjectGitMutation(
      props.projectId,
      'remove-untracked-file',
      file.path,
    );
    await removeProjectGitUntrackedFile(
      props.projectId,
      file.path,
      confirmation.token,
    );
    successMessage.value = `Arquivo "${file.path}" excluído.`;
  });
}

async function restoreFile(file: GitFileChange): Promise<void> {
  const action =
    file.status === 'renamed'
      ? 'Restaurar rename'
      : file.status === 'copied'
        ? 'Descartar cópia'
        : 'Restaurar HEAD';
  const detail =
    file.status === 'renamed'
      ? `O rename "${file.previousPath ?? ''} → ${file.path}" será totalmente desfeito.`
      : file.status === 'copied'
        ? `A cópia "${file.path}" será removida e o estado do HEAD será preservado.`
        : `O conflito em "${file.path}" será substituído pela versão do HEAD.`;
  const confirmed = await confirmDialog({
    title: `${action}?`,
    message: `${detail} Alterações locais dessa operação serão perdidas.`,
    confirmLabel: action,
    tone: 'danger',
  });
  if (!confirmed) return;

  await finishMutation({ kind: 'restore', path: file.path }, async () => {
    const confirmation = await prepareProjectGitUndo(
      props.projectId,
      'file',
      file.path,
    );
    await undoProjectGitFile(
      props.projectId,
      file.path,
      confirmation.token,
    );
    successMessage.value = `"${file.path}" restaurado para o estado do HEAD.`;
  });
}

watch(
  () => [
    props.projectId,
    props.overview.branch,
    props.overview.latestCommit?.hash,
    props.overview.clean,
    props.overview.ahead,
    props.overview.behind,
    props.overview.upstream,
  ],
  () => {
    void loadCommitStatus();
  },
);

onMounted(() => {
  void loadCommitStatus();
});
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
        Alterações locais
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
                {{ commit.authorName }} · {{ formatCommitDate(commit.authoredAt) }}
              </small>
            </div>
            <span
              v-if="isLatestCommit(commit.hash)"
              class="git-undo-publication"
              :class="{
                'is-published': commitStatus?.strategy === 'revert',
                'is-local': commitStatus?.strategy === 'reset',
                'is-blocked': commitStatus && !commitStatus.available,
              }"
            >
              {{ commitStateLabel }}
            </span>
            <button
              v-if="isLatestCommit(commit.hash)"
              type="button"
              class="git-undo-danger"
              :disabled="!canUndoCommit"
              @click="undoCommit"
            >
              <ArrowPathRoundedSquareIcon aria-hidden="true" />
              {{
                operationFor('commit')
                  ? 'Processando…'
                  : loadingCommitStatus
                    ? 'Verificando…'
                    : commitActionLabel
              }}
            </button>
          </article>
        </div>
        <div v-else class="git-undo-empty">Nenhum commit disponível.</div>

        <p
          v-if="commitStatus && !commitStatus.available"
          class="git-undo-note"
        >
          {{ undoExplanation }}
        </p>
        <p v-else class="git-undo-guidance">{{ undoExplanation }}</p>
      </div>

      <div v-show="activeView === 'files'" class="git-undo-panel">
        <header class="git-undo-heading">
          <div>
            <h2>Alterações locais</h2>
            <p>Escolha entre tirar do staged ou descartar conteúdo.</p>
          </div>
        </header>

        <div v-if="overview.files.length" class="git-undo-files">
          <article v-for="file in overview.files" :key="file.path">
            <DocumentTextIcon aria-hidden="true" />
            <div class="git-undo-file-main">
              <code>
                <template v-if="file.previousPath && file.status === 'renamed'">
                  {{ file.previousPath }} → {{ file.path }}
                </template>
                <template v-else>{{ file.path }}</template>
              </code>
              <div class="git-undo-file-badges">
                <StatusBadge :tone="gitFileToneFor(file.status)">
                  {{ statusLabels[file.status] }}
                </StatusBadge>
                <span v-if="hasStaged(file)" class="git-undo-stage-badge">
                  Staged
                </span>
                <span
                  v-if="hasWorktreeChange(file)"
                  class="git-undo-worktree-badge"
                >
                  Não staged
                </span>
              </div>
            </div>

            <div class="git-undo-file-actions">
              <button
                v-if="hasStaged(file) && file.status !== 'conflicted'"
                type="button"
                class="git-undo-file-button"
                :disabled="busy || running"
                @click="unstageFile(file)"
              >
                <ArrowDownTrayIcon aria-hidden="true" />
                {{
                  operationFor('unstage', file)
                    ? 'Removendo…'
                    : 'Tirar do staged'
                }}
              </button>

              <button
                v-if="
                  hasWorktreeChange(file) &&
                  file.status !== 'untracked' &&
                  !isSpecialRestore(file)
                "
                type="button"
                class="git-undo-file-button is-danger"
                :disabled="busy || running"
                @click="discardFile(file)"
              >
                {{
                  operationFor('discard', file)
                    ? 'Descartando…'
                    : 'Descartar alterações'
                }}
              </button>

              <button
                v-if="file.status === 'untracked'"
                type="button"
                class="git-undo-file-button is-danger"
                :disabled="busy || running"
                @click="removeUntracked(file)"
              >
                <TrashIcon aria-hidden="true" />
                {{
                  operationFor('remove', file)
                    ? 'Excluindo…'
                    : 'Excluir arquivo'
                }}
              </button>

              <button
                v-if="isSpecialRestore(file)"
                type="button"
                class="git-undo-file-button is-danger"
                :disabled="busy || running"
                @click="restoreFile(file)"
              >
                {{
                  operationFor('restore', file)
                    ? 'Restaurando…'
                    : file.status === 'renamed'
                      ? 'Restaurar rename'
                      : file.status === 'copied'
                        ? 'Descartar cópia'
                        : 'Restaurar HEAD'
                }}
              </button>
            </div>
          </article>
        </div>
        <div v-else class="git-undo-empty">Nenhuma alteração local.</div>

        <p v-if="overview.files.length" class="git-undo-guidance is-danger">
          Tirar do staged preserva conteúdo. Descartar, restaurar e excluir são
          ações destrutivas e sempre pedem confirmação.
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
.git-undo-danger > svg,
.git-undo-file-button > svg {
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

.git-undo-publication,
.git-undo-stage-badge,
.git-undo-worktree-badge {
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

.git-undo-publication.is-local,
.git-undo-stage-badge {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-undo-publication.is-blocked {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.git-undo-worktree-badge {
  color: var(--text-muted);
  background: var(--surface-2);
}

.git-undo-danger,
.git-undo-file-button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.git-undo-danger,
.git-undo-file-button.is-danger {
  border-color: color-mix(in srgb, var(--danger-text) 48%, var(--border));
  color: var(--danger-text, var(--text));
}

.git-undo-danger:hover:not(:disabled),
.git-undo-file-button.is-danger:hover:not(:disabled) {
  border-color: var(--danger-text);
  background: var(--danger-surface, var(--surface-2));
}

.git-undo-file-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-2);
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
  min-height: 58px;
  align-items: center;
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

.git-undo-file-main {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 5px;
}

.git-undo-file-main code {
  overflow: hidden;
  color: var(--text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-file-badges,
.git-undo-file-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.git-undo-file-actions {
  flex: none;
  justify-content: flex-end;
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

  .git-undo-files article {
    align-items: stretch;
    flex-direction: column;
  }

  .git-undo-file-actions {
    width: 100%;
    justify-content: flex-start;
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

  .git-undo-file-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .git-undo-file-button {
    width: 100%;
  }
}
</style>
