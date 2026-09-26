<script setup lang="ts">
import {
  ArrowPathIcon,
  FolderPlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  createProjectGitWorktree,
  fetchProjectGitWorktrees,
  prepareProjectGitWorktreeRemoval,
  removeProjectGitWorktree,
  type PrepareProjectGitWorktreeRemovalResult,
  type ProjectGitWorktree,
} from '../api/git-worktrees';

const props = defineProps<{ project: Project }>();

const loading = ref(false);
const mutationRunning = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const worktrees = ref<ProjectGitWorktree[]>([]);
const showCreateForm = ref(false);
const branch = ref('');
const directoryName = ref('');
const createBranch = ref(false);
const pendingRemoval = ref<PrepareProjectGitWorktreeRemovalResult | null>(null);
let generation = 0;

const linkedWorktreeCount = computed(
  () => worktrees.value.filter((worktree) => worktree.kind === 'linked').length,
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

function resetCreateForm(): void {
  branch.value = '';
  directoryName.value = '';
  createBranch.value = false;
  showCreateForm.value = false;
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  pendingRemoval.value = null;

  try {
    const inspection = await fetchProjectGitWorktrees(props.project.id);
    if (requestGeneration !== generation) return;

    worktrees.value = inspection.worktrees;
    if (inspection.state !== 'ready') {
      errorMessage.value =
        inspection.diagnostic ??
        'Não foi possível confirmar o estado atual dos worktrees.';
    }
  } catch (error) {
    if (requestGeneration !== generation) return;
    worktrees.value = [];
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
      createBranch: createBranch.value,
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

async function prepareRemoval(worktree: ProjectGitWorktree): Promise<void> {
  if (mutationRunning.value || worktree.kind !== 'linked') return;
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

watch(
  () => props.project.id,
  () => {
    resetCreateForm();
    clearMessages();
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section class="worktrees-tool">
    <header class="worktrees-toolbar">
      <span class="worktrees-count">
        <strong>{{ linkedWorktreeCount }}</strong>
        vinculado{{ linkedWorktreeCount === 1 ? '' : 's' }}
      </span>

      <div class="worktrees-toolbar-actions">
        <button
          class="worktrees-secondary-button worktrees-refresh-button"
          type="button"
          :disabled="loading || mutationRunning"
          aria-label="Atualizar worktrees"
          title="Atualizar worktrees"
          @click="load"
        >
          <ArrowPathIcon
            :class="{ 'is-spinning': loading }"
            aria-hidden="true"
          />
        </button>
        <button
          class="worktrees-primary-button"
          type="button"
          :disabled="mutationRunning"
          @click="showCreateForm = !showCreateForm"
        >
          <FolderPlusIcon aria-hidden="true" />
          {{ showCreateForm ? 'Fechar' : 'Novo worktree' }}
        </button>
      </div>
    </header>

    <div class="worktrees-content">
      <form
        v-if="showCreateForm"
        class="worktrees-create-card"
        @submit.prevent="submitCreate"
      >
        <div class="worktrees-create-heading">
          <div>
            <h3>Novo worktree</h3>
            <p>
              Use uma branch existente ou marque a opção para criar uma nova.
            </p>
          </div>
        </div>

        <div class="worktrees-create-grid">
          <label class="worktrees-field">
            <span>Branch</span>
            <input
              v-model="branch"
              name="branch"
              type="text"
              autocomplete="off"
              placeholder="feature/minha-tarefa"
              :disabled="mutationRunning"
              required
            />
          </label>

          <label class="worktrees-field">
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
        </div>

        <div class="worktrees-create-footer">
          <label class="worktrees-checkbox">
            <input
              v-model="createBranch"
              type="checkbox"
              :disabled="mutationRunning"
            />
            <span>Criar nova branch</span>
          </label>
          <button
            class="worktrees-primary-button"
            type="submit"
            :disabled="mutationRunning"
          >
            {{ mutationRunning ? 'Criando…' : 'Criar worktree' }}
          </button>
        </div>
      </form>

      <p v-if="successMessage" class="worktrees-success" aria-live="polite">
        {{ successMessage }}
      </p>
      <p v-if="errorMessage" class="worktrees-error" role="alert">
        {{ errorMessage }}
      </p>

      <div v-if="loading && worktrees.length === 0" class="worktrees-empty">
        Consultando worktrees…
      </div>

      <div v-else-if="worktrees.length === 0" class="worktrees-empty">
        Nenhum worktree encontrado para este projeto.
      </div>

      <div v-else class="worktrees-list">
        <article
          v-for="worktree in worktrees"
          :key="worktree.id"
          class="worktree-row"
        >
          <div class="worktree-main">
            <div class="worktree-title-row">
              <strong>{{ displayBranch(worktree) }}</strong>
              <span v-if="worktree.kind === 'main'" class="worktree-badge">
                principal
              </span>
              <span v-else-if="worktree.locked" class="worktree-badge">
                bloqueado
              </span>
            </div>
            <div class="worktree-meta">
              <span>{{ displayDirectory(worktree.path) }}</span>
              <code>{{ shortHead(worktree.head) }}</code>
            </div>
            <p v-if="worktree.lockReason" class="worktree-note">
              {{ worktree.lockReason }}
            </p>
          </div>

          <button
            v-if="worktree.kind === 'linked'"
            class="worktrees-danger-button"
            type="button"
            :disabled="mutationRunning || worktree.locked"
            :title="worktree.lockReason || 'Remover worktree'"
            @click="prepareRemoval(worktree)"
          >
            <TrashIcon aria-hidden="true" />
            Remover
          </button>
        </article>
      </div>

      <div v-if="pendingRemoval" class="worktrees-confirmation" role="alert">
        <div>
          <strong>Confirmar remoção?</strong>
          <p>
            O worktree de
            <code>{{ pendingRemoval.branch || 'HEAD destacado' }}</code>
            será removido. A branch não será apagada.
          </p>
        </div>
        <div class="worktrees-confirmation-actions">
          <button
            class="worktrees-secondary-button"
            type="button"
            :disabled="mutationRunning"
            @click="pendingRemoval = null"
          >
            Cancelar
          </button>
          <button
            class="worktrees-danger-button worktrees-danger-button-solid"
            type="button"
            :disabled="mutationRunning"
            @click="confirmRemoval"
          >
            {{ mutationRunning ? 'Removendo…' : 'Confirmar remoção' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.worktrees-tool {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.worktrees-toolbar {
  display: flex;
  min-height: 54px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px 9px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.worktrees-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.worktrees-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 10px;
}

.worktrees-count strong {
  display: inline-grid;
  min-width: 24px;
  height: 24px;
  place-items: center;
  padding: 0 7px;
  border-radius: 999px;
  color: var(--text);
  background: var(--surface-2);
  font-size: 10px;
}

.worktrees-primary-button,
.worktrees-secondary-button,
.worktrees-danger-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.worktrees-primary-button {
  border-color: var(--accent);
  color: #fff;
  background: var(--accent);
}

.worktrees-primary-button:hover:not(:disabled) {
  background: var(--accent-strong);
}

.worktrees-secondary-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.worktrees-primary-button svg,
.worktrees-secondary-button svg,
.worktrees-danger-button svg {
  width: 15px;
  height: 15px;
}

.worktrees-refresh-button {
  width: 34px;
  padding: 0;
}

.worktrees-refresh-button .is-spinning {
  animation: worktrees-spin 0.8s linear infinite;
}

.worktrees-primary-button:disabled,
.worktrees-secondary-button:disabled,
.worktrees-danger-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.worktrees-content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow-y: auto;
}

.worktrees-create-card {
  display: grid;
  flex: 0 0 auto;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.worktrees-create-heading h3,
.worktrees-create-heading p {
  margin: 0;
}

.worktrees-create-heading h3 {
  color: var(--text);
  font-size: 12px;
}

.worktrees-create-heading p {
  margin-top: 3px;
  color: var(--text-dim);
  font-size: 10px;
}

.worktrees-create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.worktrees-field {
  display: grid;
  gap: 5px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.worktrees-field small {
  color: var(--text-dim);
  font-weight: 500;
}

.worktrees-field input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  box-sizing: border-box;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-1);
  font: inherit;
  font-size: 10px;
}

.worktrees-field input:focus {
  border-color: var(--accent);
  outline: 2px solid var(--accent-soft);
}

.worktrees-create-footer,
.worktrees-confirmation-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.worktrees-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 10px;
}

.worktrees-success,
.worktrees-error {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 10px;
}

.worktrees-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.worktrees-error {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.worktrees-empty {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  place-content: center;
  padding: 28px 18px;
  color: var(--text-dim);
  text-align: center;
  font-size: 10px;
}

.worktrees-list {
  display: grid;
  flex: 0 0 auto;
}

.worktree-row {
  display: flex;
  min-width: 0;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  transition: background 120ms ease;
}

.worktree-row:hover {
  background: var(--surface-2);
}

.worktree-main {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.worktree-title-row,
.worktree-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.worktree-title-row strong {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.worktree-badge {
  flex: none;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-dim);
  font-size: 8px;
  font-weight: var(--font-weight-strong);
  text-transform: uppercase;
}

.worktree-meta {
  color: var(--text-dim);
  font-size: 10px;
}

.worktree-meta code {
  color: var(--text-muted);
  font-size: 9px;
}

.worktree-note {
  margin: 0;
  color: var(--text-dim);
  font-size: 9px;
}

.worktrees-danger-button {
  flex: none;
  border-color: color-mix(in srgb, var(--danger-text) 42%, var(--border));
  color: var(--danger-text);
}

.worktrees-danger-button:hover:not(:disabled) {
  border-color: var(--danger-text);
  background: var(--danger-surface);
}

.worktrees-danger-button-solid {
  color: #fff;
  background: var(--danger-text);
}

.worktrees-confirmation {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 10px 14px;
  border-top: 1px solid
    color-mix(in srgb, var(--danger-text) 30%, var(--border));
  color: var(--danger-text);
  background: var(--danger-surface);
}

.worktrees-confirmation p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 10px;
}

@keyframes worktrees-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .worktrees-refresh-button .is-spinning {
    animation: none;
  }
}

@media (max-width: 720px) {
  .worktrees-create-grid {
    grid-template-columns: 1fr;
  }

  .worktrees-create-footer,
  .worktrees-confirmation,
  .worktrees-confirmation-actions,
  .worktree-row {
    align-items: stretch;
    flex-direction: column;
  }

  .worktrees-danger-button {
    align-self: flex-start;
  }
}
</style>
