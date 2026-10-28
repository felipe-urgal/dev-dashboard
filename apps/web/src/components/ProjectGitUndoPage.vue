<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import type {
  GitFileChange,
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
import {
  describeCommitUndo,
  restoreLabelFor,
  stagedFilesToUnstage,
  type UndoFileAction,
} from '../utils/git-undo';
import GitUndoCommitCard from './git-undo/GitUndoCommitCard.vue';
import GitUndoFileList from './git-undo/GitUndoFileList.vue';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview;
  busy: boolean;
}>();

const emit = defineEmits<{
  changed: [];
  'open-sync': [];
  'open-history': [];
  'open-diff': [];
}>();

type UndoOperationKind =
  'commit' | 'unstage' | 'unstage-all' | 'discard' | 'remove' | 'restore';

const activeOperation = ref<{ kind: UndoOperationKind; path?: string } | null>(
  null,
);
const commitStatus = ref<GitUndoCommitStatus | null>(null);
const loadingCommitStatus = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const filesSection = ref<HTMLElement | null>(null);

const running = computed(() => activeOperation.value !== null);
const commitView = computed(() =>
  describeCommitUndo(commitStatus.value, loadingCommitStatus.value),
);

function clearFeedback(): void {
  errorMessage.value = '';
  successMessage.value = '';
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
  if (
    commitView.value.blocked ||
    running.value ||
    props.busy ||
    !props.overview.latestCommit
  ) {
    return;
  }
  const confirmed = await confirmDialog({
    title: commitView.value.confirm.title,
    message: commitView.value.confirm.message,
    confirmLabel: commitView.value.confirm.label,
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
    await discardProjectGitFile(props.projectId, file.path, confirmation.token);
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
    await undoProjectGitFile(props.projectId, file.path, confirmation.token);
    successMessage.value = `"${file.path}" restaurado para o estado do HEAD.`;
  });
}

async function unstageAll(): Promise<void> {
  const targets = stagedFilesToUnstage(props.overview.files);
  if (targets.length === 0) return;

  await finishMutation({ kind: 'unstage-all' }, async () => {
    let done = 0;
    for (const file of targets) {
      await unstageProjectGitFile(props.projectId, file.path);
      done += 1;
    }
    successMessage.value = `${done} arquivos removidos do staged sem perder conteúdo.`;
  });
}

function runFileAction(action: UndoFileAction, file: GitFileChange): void {
  if (action === 'unstage') void unstageFile(file);
  else if (action === 'discard') void discardFile(file);
  else if (action === 'remove') void removeUntracked(file);
  else void restoreFile(file);
}

function handleBlockAction(): void {
  if (commitView.value.block?.action === 'sync') emit('open-sync');
  else filesSection.value?.scrollIntoView?.({ behavior: 'smooth' });
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

    <div class="git-undo-layout">
      <GitUndoCommitCard
        :commit="overview.latestCommit"
        :view="commitView"
        :busy="activeOperation?.kind === 'commit'"
        :loading="loadingCommitStatus"
        @undo="undoCommit"
        @block-action="handleBlockAction"
        @open-history="emit('open-history')"
      />

      <div ref="filesSection">
        <GitUndoFileList
          :files="overview.files"
          :disabled="busy || running"
          :operation="activeOperation"
          @action="runFileAction"
          @unstage-all="unstageAll"
          @open-diff="emit('open-diff')"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.git-undo-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.git-undo-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  align-items: start;
  gap: 16px;
}

.git-undo-success {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  color: var(--success-text);
  background: var(--success-surface);
  font-size: 13.5px;
}

@media (max-width: 1000px) {
  .git-undo-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
