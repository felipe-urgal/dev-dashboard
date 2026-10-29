<script setup lang="ts">
import {
  ArrowPathIcon,
  FolderIcon,
  FolderPlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { NModal } from 'naive-ui';
import { computed, nextTick, ref, watch } from 'vue';

import type { Project, ProjectGitWorkspace } from '@dev-dashboard/contracts';

import { fetchProjectGitWorkspace } from '../api/git-workspace';
import {
  createProjectGitWorktree,
  fetchProjectGitWorktrees,
  prepareProjectGitWorktreeRemoval,
  pruneProjectGitWorktree,
  removeProjectGitWorktree,
  type PrepareProjectGitWorktreeRemovalResult,
  type ProjectGitWorktree,
} from '../api/git-worktrees';
import UiButton from './ui/UiButton.vue';
import UiTag from './ui/UiTag.vue';

const props = defineProps<{ project: Project }>();

const loading = ref(false);
const mutationRunning = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const branchListError = ref('');
const worktrees = ref<ProjectGitWorktree[]>([]);
const workspace = ref<ProjectGitWorkspace | null>(null);
const showCreateForm = ref(false);
const branchMode = ref<'existing' | 'new'>('existing');
const branch = ref('');
const directoryName = ref('');
const pendingRemoval = ref<PrepareProjectGitWorktreeRemovalResult | null>(null);
const createForm = ref<HTMLFormElement | null>(null);
let generation = 0;

const linkedWorktreeCount = computed(
  () => worktrees.value.filter((worktree) => worktree.kind === 'linked').length,
);

const usedBranches = computed(
  () =>
    new Set(
      worktrees.value
        .map((worktree) => worktree.branch)
        .filter((branchName): branchName is string => Boolean(branchName)),
    ),
);

const availableLocalBranches = computed(() =>
  (workspace.value?.branches ?? [])
    .filter(
      (candidate) =>
        candidate.kind === 'local' && !usedBranches.value.has(candidate.name),
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
);

const baseBranch = computed(
  () =>
    workspace.value?.branches.find(
      (candidate) => candidate.kind === 'local' && candidate.current,
    )?.name ??
    worktrees.value.find((worktree) => worktree.kind === 'main')?.branch ??
    'HEAD atual',
);

function directoryFromBranch(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function displayDirectory(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/u, '');
  return normalized.split('/').pop() || path;
}

function displayBranch(worktree: ProjectGitWorktree): string {
  if (worktree.branch) return worktree.branch;
  return worktree.detached ? 'HEAD destacado' : 'Sem branch';
}

function shortHead(head: string): string {
  return head.length > 8 ? head.slice(0, 8) : head;
}

function clearMessages(): void {
  errorMessage.value = '';
  successMessage.value = '';
}

function syncExistingBranchSelection(): void {
  if (branchMode.value !== 'existing') return;
  if (
    branch.value &&
    availableLocalBranches.value.some(
      (candidate) => candidate.name === branch.value,
    )
  ) {
    return;
  }
  branch.value = availableLocalBranches.value[0]?.name ?? '';
}

function resetCreateForm(): void {
  branchMode.value = 'existing';
  branch.value = '';
  directoryName.value = '';
  showCreateForm.value = false;
}

function toggleCreateForm(): void {
  showCreateForm.value = !showCreateForm.value;
  if (showCreateForm.value) syncExistingBranchSelection();
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  pendingRemoval.value = null;

  try {
    const [inspectionResult, workspaceResult] = await Promise.allSettled([
      fetchProjectGitWorktrees(props.project.id),
      fetchProjectGitWorkspace(props.project.id),
    ]);
    if (requestGeneration !== generation) return;

    if (inspectionResult.status === 'rejected') {
      throw inspectionResult.reason;
    }

    const inspection = inspectionResult.value;
    worktrees.value = inspection.worktrees;
    if (workspaceResult.status === 'fulfilled') {
      workspace.value = workspaceResult.value;
      branchListError.value = '';
    } else {
      workspace.value = null;
      branchListError.value =
        'As branches locais não puderam ser carregadas. Atualize antes de usar uma branch existente.';
    }
    syncExistingBranchSelection();

    if (inspection.state !== 'ready') {
      errorMessage.value =
        inspection.diagnostic ??
        'Não foi possível confirmar o estado atual dos worktrees.';
    }
  } catch (error) {
    if (requestGeneration !== generation) return;
    worktrees.value = [];
    workspace.value = null;
    branchListError.value = '';
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os worktrees.';
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function submitCreate(): Promise<void> {
  if (mutationRunning.value) return;
  clearMessages();

  const normalizedBranch = branch.value.trim();
  const normalizedDirectory =
    directoryName.value.trim() || directoryFromBranch(normalizedBranch);

  if (!normalizedBranch) {
    errorMessage.value = 'Informe a branch do worktree.';
    return;
  }
  if (!normalizedDirectory) {
    errorMessage.value = 'Informe um diretório válido para o worktree.';
    return;
  }

  mutationRunning.value = true;
  try {
    const result = await createProjectGitWorktree(props.project.id, {
      branch: normalizedBranch,
      directoryName: normalizedDirectory,
      createBranch: branchMode.value === 'new',
    });

    if (result.state === 'created' || result.state === 'already-present') {
      successMessage.value =
        result.state === 'created'
          ? 'Worktree criado.'
          : 'Esse worktree já existe.';
      resetCreateForm();
      await load();
      successMessage.value =
        result.state === 'created'
          ? 'Worktree criado.'
          : 'Esse worktree já existe.';
      return;
    }

    errorMessage.value =
      result.diagnostic ?? 'Não foi possível criar o worktree.';
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível criar o worktree.';
  } finally {
    mutationRunning.value = false;
  }
}

async function cleanupPrunable(worktree: ProjectGitWorktree): Promise<void> {
  if (mutationRunning.value || !worktree.prunable) return;
  clearMessages();
  pendingRemoval.value = null;
  mutationRunning.value = true;

  try {
    const result = await pruneProjectGitWorktree(props.project.id, worktree.id);

    if (result.state === 'pruned' || result.state === 'already-absent') {
      await load();
      successMessage.value =
        result.state === 'pruned'
          ? 'Registro órfão removido.'
          : 'O registro órfão já havia sido removido.';
      return;
    }

    errorMessage.value =
      result.diagnostic ?? 'Não foi possível limpar o registro órfão.';
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível limpar o registro órfão.';
  } finally {
    mutationRunning.value = false;
  }
}

async function prepareRemoval(worktree: ProjectGitWorktree): Promise<void> {
  if (
    mutationRunning.value ||
    worktree.kind !== 'linked' ||
    worktree.prunable ||
    worktree.dirty
  )
    return;
  clearMessages();
  pendingRemoval.value = null;
  mutationRunning.value = true;

  try {
    const result = await prepareProjectGitWorktreeRemoval(
      props.project.id,
      worktree.id,
    );

    if (result.state === 'ready' && result.confirmationToken) {
      pendingRemoval.value = result;
      return;
    }

    errorMessage.value =
      result.diagnostic ??
      (result.state === 'not-found'
        ? 'O worktree não existe mais.'
        : 'A remoção do worktree foi bloqueada.');

    if (result.state === 'not-found') await load();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível preparar a remoção do worktree.';
  } finally {
    mutationRunning.value = false;
  }
}

async function confirmRemoval(): Promise<void> {
  const pending = pendingRemoval.value;
  if (!pending?.confirmationToken || mutationRunning.value) return;

  clearMessages();
  mutationRunning.value = true;
  try {
    const result = await removeProjectGitWorktree(
      props.project.id,
      pending.worktreeId,
      pending.confirmationToken,
    );

    if (result.state === 'removed' || result.state === 'already-absent') {
      pendingRemoval.value = null;
      await load();
      successMessage.value =
        result.state === 'removed'
          ? 'Worktree removido.'
          : 'O worktree já havia sido removido.';
      return;
    }

    errorMessage.value =
      result.diagnostic ?? 'Não foi possível remover o worktree.';
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover o worktree.';
  } finally {
    mutationRunning.value = false;
  }
}

watch(branchMode, (mode) => {
  branch.value = '';
  directoryName.value = '';
  if (mode === 'existing') syncExistingBranchSelection();
});

watch(
  () => props.project.id,
  () => {
    resetCreateForm();
    clearMessages();
    void load();
  },
  { immediate: true },
);

/** O diálogo abre fora do fluxo normal: o foco no campo é dado por aqui. */
watch(showCreateForm, async (open) => {
  if (!open) return;
  await nextTick();
  setTimeout(() => {
    createForm.value
      ?.querySelector<HTMLElement>('select:not(:disabled), input[type=text]')
      ?.focus();
  }, 60);
});
</script>

<template>
  <section class="git-wt-page">
    <header class="git-wt-toolbar">
      <span class="git-wt-count">
        <strong>{{ linkedWorktreeCount }}</strong>
        vinculado{{ linkedWorktreeCount === 1 ? '' : 's' }}
      </span>

      <span class="git-wt-spacer" />

      <UiButton
        icon
        variant="ghost"
        aria-label="Atualizar worktrees"
        title="Atualizar worktrees"
        :disabled="loading || mutationRunning"
        @click="load"
      >
        <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
      </UiButton>
      <UiButton
        variant="primary"
        class="worktrees-primary-button"
        :disabled="mutationRunning"
        @click="toggleCreateForm"
      >
        <FolderPlusIcon aria-hidden="true" />
        Novo worktree
      </UiButton>
    </header>

    <p
      v-if="successMessage"
      class="git-wt-banner is-success"
      aria-live="polite"
    >
      {{ successMessage }}
    </p>
    <p v-if="errorMessage" class="git-wt-banner is-error" role="alert">
      {{ errorMessage }}
    </p>

    <div v-if="loading && worktrees.length === 0" class="git-wt-note">
      Consultando worktrees…
    </div>

    <div v-else-if="worktrees.length === 0" class="git-wt-note">
      Nenhum worktree encontrado para este projeto.
    </div>

    <section v-else class="git-wt-list">
      <article
        v-for="worktree in worktrees"
        :key="worktree.id"
        class="git-wt-row"
      >
        <FolderIcon class="git-wt-icon" aria-hidden="true" />

        <div class="git-wt-info">
          <div class="git-wt-title">
            <strong>{{ displayBranch(worktree) }}</strong>
            <UiTag v-if="worktree.kind === 'main'" tone="accent">
              principal
            </UiTag>
            <UiTag v-else-if="worktree.prunable" tone="warning">órfão</UiTag>
            <UiTag v-else-if="worktree.locked">bloqueado</UiTag>
            <UiTag v-if="worktree.dirty" tone="warning">alterações</UiTag>
          </div>
          <div class="git-wt-meta">
            <span :title="worktree.path">{{
              displayDirectory(worktree.path)
            }}</span>
            <code>{{ shortHead(worktree.head) }}</code>
          </div>
          <p v-if="worktree.prunable" class="git-wt-warning">
            {{ worktree.pruneReason || 'A pasta do worktree não existe mais.' }}
          </p>
          <p v-if="worktree.lockReason" class="git-wt-note-line">
            {{ worktree.lockReason }}
          </p>
          <p v-if="worktree.dirty" class="git-wt-note-line">
            Possui alterações locais; resolva antes de remover.
          </p>
        </div>

        <UiButton
          v-if="worktree.kind === 'linked' && worktree.prunable"
          :disabled="mutationRunning || worktree.locked"
          :title="
            worktree.lockReason ||
            'Limpar somente o registro órfão deste worktree'
          "
          @click="cleanupPrunable(worktree)"
        >
          <TrashIcon aria-hidden="true" />
          Limpar registro
        </UiButton>
        <UiButton
          v-else-if="worktree.kind === 'linked'"
          variant="danger"
          class="worktrees-danger-button"
          :disabled="mutationRunning || worktree.locked || worktree.dirty"
          :title="
            worktree.dirty
              ? 'Resolva as alterações locais antes de remover'
              : worktree.lockReason || 'Remover worktree'
          "
          @click="prepareRemoval(worktree)"
        >
          <TrashIcon aria-hidden="true" />
          Remover
        </UiButton>
      </article>
    </section>

    <NModal
      :show="showCreateForm"
      :mask-closable="!mutationRunning"
      :close-on-esc="false"
      :auto-focus="false"
      :trap-focus="false"
      @update:show="
        (show: boolean) => !show && !mutationRunning && resetCreateForm()
      "
    >
      <form
        ref="createForm"
        class="git-wt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Novo worktree"
        @submit.prevent="submitCreate"
        @keydown.esc="!mutationRunning && resetCreateForm()"
      >
        <h3>Novo worktree</h3>
        <p>
          Escolha uma branch local livre ou crie uma nova a partir do checkout
          principal.
        </p>

        <div
          class="git-wt-chips"
          role="radiogroup"
          aria-label="Origem da branch"
        >
          <label :data-active="branchMode === 'existing' || undefined">
            <input
              v-model="branchMode"
              type="radio"
              value="existing"
              :disabled="mutationRunning"
            />
            Branch existente
          </label>
          <label :data-active="branchMode === 'new' || undefined">
            <input
              v-model="branchMode"
              type="radio"
              value="new"
              :disabled="mutationRunning"
            />
            Nova branch
          </label>
        </div>

        <label v-if="branchMode === 'existing'" class="git-wt-field">
          <span>Branch local</span>
          <select
            v-model="branch"
            name="branch"
            :disabled="mutationRunning || availableLocalBranches.length === 0"
            required
          >
            <option
              v-if="availableLocalBranches.length === 0"
              value=""
              disabled
            >
              Nenhuma branch local livre
            </option>
            <option
              v-for="candidate in availableLocalBranches"
              :key="candidate.name"
              :value="candidate.name"
            >
              {{ candidate.name }}
            </option>
          </select>
          <small v-if="branchListError" class="is-error">
            {{ branchListError }}
          </small>
        </label>

        <label v-else class="git-wt-field">
          <span>Nome da nova branch</span>
          <input
            v-model="branch"
            name="branch"
            type="text"
            autocomplete="off"
            placeholder="feature/minha-tarefa"
            :disabled="mutationRunning"
            required
          />
          <small>
            Será criada a partir de <code>{{ baseBranch }}</code
            >.
          </small>
        </label>

        <label class="git-wt-field">
          <span>Diretório <small>opcional</small></span>
          <input
            v-model="directoryName"
            name="directoryName"
            type="text"
            autocomplete="off"
            placeholder="gerado pela branch"
            :disabled="mutationRunning"
          />
        </label>

        <footer>
          <UiButton :disabled="mutationRunning" @click="resetCreateForm">
            Cancelar
          </UiButton>
          <UiButton
            type="submit"
            variant="primary"
            :busy="mutationRunning"
            :disabled="
              mutationRunning ||
              (branchMode === 'existing' && availableLocalBranches.length === 0)
            "
          >
            {{ mutationRunning ? 'Criando…' : 'Criar worktree' }}
          </UiButton>
        </footer>
      </form>
    </NModal>

    <NModal
      :show="pendingRemoval !== null"
      :mask-closable="!mutationRunning"
      :close-on-esc="false"
      :auto-focus="false"
      :trap-focus="false"
      @update:show="
        (show: boolean) => !show && !mutationRunning && (pendingRemoval = null)
      "
    >
      <div
        class="git-wt-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirmar remoção"
        tabindex="-1"
        @keydown.esc="!mutationRunning && (pendingRemoval = null)"
      >
        <h3>Remover worktree?</h3>
        <p>
          O worktree de
          <code>{{ pendingRemoval?.branch || 'HEAD destacado' }}</code>
          será removido. A branch não será apagada.
        </p>
        <footer>
          <UiButton :disabled="mutationRunning" @click="pendingRemoval = null">
            Cancelar
          </UiButton>
          <UiButton
            variant="danger"
            class="worktrees-confirm-remove"
            :busy="mutationRunning"
            :disabled="mutationRunning"
            @click="confirmRemoval"
          >
            {{ mutationRunning ? 'Removendo…' : 'Remover worktree' }}
          </UiButton>
        </footer>
      </div>
    </NModal>
  </section>
</template>

<style scoped>
.git-wt-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.git-wt-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.git-wt-count {
  color: var(--text-muted);
  font-size: 13px;
}

.git-wt-count strong {
  color: var(--text);
}

.git-wt-spacer {
  flex: 1 1 0;
}

.spinning {
  animation: git-wt-spin 1s linear infinite;
}

@keyframes git-wt-spin {
  to {
    transform: rotate(360deg);
  }
}

.git-wt-banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
}

.git-wt-banner.is-success {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 12%, transparent);
}

.git-wt-banner.is-error {
  color: var(--danger-text, #f85149);
  background: color-mix(in srgb, var(--danger-text, #f85149) 12%, transparent);
}

.git-wt-note {
  padding: 28px 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  background: var(--surface-1);
  text-align: center;
}

.git-wt-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-wt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.git-wt-row:first-child {
  border-top: 0;
}

.git-wt-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  color: var(--text-dim);
}

.git-wt-info {
  min-width: 0;
  flex: 1;
}

.git-wt-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.git-wt-title strong {
  font-weight: 650;
}

.git-wt-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
}

.git-wt-meta code {
  color: var(--accent);
}

.git-wt-warning,
.git-wt-note-line {
  margin: 6px 0 0;
  font-size: 12.5px;
}

.git-wt-warning {
  color: var(--warning-text);
}

.git-wt-note-line {
  color: var(--text-muted);
}

.git-wt-dialog {
  display: flex;
  width: 480px;
  max-width: 92vw;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  color: var(--text);
  background: var(--surface-1);
  box-shadow: 0 16px 40px rgb(0 0 0 / 45%);
}

.git-wt-dialog h3 {
  margin: 0;
  font-size: 16px;
}

.git-wt-dialog p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.git-wt-dialog code {
  font-family: var(--font-family-mono);
}

.git-wt-chips {
  display: flex;
  gap: 6px;
}

.git-wt-chips label {
  display: inline-flex;
  height: 30px;
  align-items: center;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.git-wt-chips label[data-active] {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-wt-chips input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.git-wt-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.git-wt-field > span {
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
}

.git-wt-field small {
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 500;
}

.git-wt-field small.is-error {
  color: var(--danger-text, #f85149);
}

.git-wt-field input,
.git-wt-field select {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 13.5px;
  outline: none;
}

.git-wt-field input:focus,
.git-wt-field select:focus {
  border-color: var(--accent);
}

.git-wt-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
