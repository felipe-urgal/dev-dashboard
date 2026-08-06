<script setup lang="ts">
import {
  ArrowUturnLeftIcon,
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

function clearFeedback(): void {
  errorMessage.value = '';
  successMessage.value = '';
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
  <section class="git-undo-card">
    <header class="git-undo-heading">
      <div>
        <span>Desfazer</span>
        <h3>Voltar alterações com segurança</h3>
        <p>
          Commits locais voltam para edição. Commits já publicados são
          revertidos sem reescrever o histórico.
        </p>
      </div>
      <ArrowUturnLeftIcon aria-hidden="true" />
    </header>

    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="git-undo-success" aria-live="polite">
      {{ successMessage }}
    </p>

    <div class="git-undo-commit">
      <div>
        <span>Último commit</span>
        <template v-if="overview.latestCommit">
          <strong>{{ overview.latestCommit.subject }}</strong>
          <code>{{ overview.latestCommit.shortHash }}</code>
        </template>
        <small v-else>Nenhum commit disponível.</small>
      </div>
      <button
        type="button"
        class="git-undo-danger"
        :disabled="!canUndoCommit"
        @click="undoCommit"
      >
        {{ running ? 'Processando…' : commitActionLabel }}
      </button>
    </div>

    <p v-if="overview.latestCommit && !overview.clean" class="git-undo-note">
      Registre ou desfaça as alterações atuais antes de desfazer o commit.
    </p>

    <div class="git-undo-divider" />

    <div class="git-undo-files-heading">
      <div>
        <span>Arquivos atuais</span>
        <strong>{{ overview.files.length }} alteração(ões)</strong>
      </div>
      <small>Desfazer restaura o arquivo para o estado do HEAD.</small>
    </div>

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
    <div v-else class="git-undo-empty">Nenhum arquivo com alteração local.</div>
  </section>
</template>

<style scoped>
.git-undo-card {
  display: grid;
  gap: var(--space-4);
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  padding: 20px;
  box-shadow: var(--shadow-1);
}

.git-undo-heading,
.git-undo-commit,
.git-undo-files-heading,
.git-undo-files article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.git-undo-heading > div,
.git-undo-commit > div,
.git-undo-files-heading > div {
  display: grid;
  gap: 4px;
}

.git-undo-heading > svg {
  width: 26px;
  height: 26px;
  flex: none;
  color: var(--text-dim);
}

.git-undo-heading span,
.git-undo-commit span,
.git-undo-files-heading span {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-undo-heading h3 {
  margin: 0;
  color: var(--text);
  font-size: var(--font-lg);
}

.git-undo-heading p,
.git-undo-note,
.git-undo-files-heading small {
  margin: 0;
  color: var(--text-dim);
}

.git-undo-commit code {
  color: var(--text-muted);
}

.git-undo-danger,
.git-undo-file-button {
  min-height: 38px;
  border: 1px solid var(--danger-border, var(--border));
  border-radius: var(--radius-md);
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

.git-undo-divider {
  height: 1px;
  background: var(--border);
}

.git-undo-files {
  display: grid;
  gap: var(--space-2);
}

.git-undo-files article {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.git-undo-files article > svg {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--text-dim);
}

.git-undo-files article > div {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  margin-right: auto;
}

.git-undo-files code {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-undo-empty {
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-muted);
  padding: var(--space-3);
}

.git-undo-success {
  margin: 0;
  border-radius: var(--radius-md);
  background: var(--success-surface);
  color: var(--success-text);
  padding: var(--space-3);
}

@media (max-width: 720px) {
  .git-undo-heading,
  .git-undo-commit,
  .git-undo-files-heading,
  .git-undo-files article {
    align-items: stretch;
    flex-direction: column;
  }

  .git-undo-files article > div {
    width: 100%;
    margin-right: 0;
  }
}
</style>
