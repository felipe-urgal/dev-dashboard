<script setup lang="ts">
import {
  DocumentPlusIcon,
  FolderPlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type {
  ProjectFileEntry,
  ProjectFileMutationPreview,
  ProjectFileMutationResult,
} from '@dev-dashboard/contracts';

import {
  applyProjectFileMutation,
  createProjectFileEntry,
  previewProjectFileMutation,
} from '../api/project-file-mutations';

type MutationMode =
  | 'create-file'
  | 'create-directory'
  | 'rename'
  | 'delete'
  | '';

const props = defineProps<{
  projectId: string;
  selected?: ProjectFileEntry;
  blocked?: boolean;
}>();

const emit = defineEmits<{
  completed: [result: ProjectFileMutationResult];
}>();

const mode = ref<MutationMode>('');
const pathInput = ref('');
const confirmationInput = ref('');
const preview = ref<ProjectFileMutationPreview>();
const busy = ref(false);
const errorMessage = ref('');

const selectedLabel = computed(() => props.selected?.path ?? 'Nenhum item selecionado');
const isCreate = computed(() =>
  mode.value === 'create-file' || mode.value === 'create-directory',
);
const title = computed(() => {
  switch (mode.value) {
    case 'create-file':
      return 'Novo arquivo';
    case 'create-directory':
      return 'Nova pasta';
    case 'rename':
      return 'Renomear';
    case 'delete':
      return 'Excluir';
    default:
      return '';
  }
});

function parentPath(value: string): string {
  const index = value.lastIndexOf('/');
  return index < 0 ? '' : value.slice(0, index);
}

function createBasePath(): string {
  const selected = props.selected;
  if (!selected) return '';
  const directory = selected.kind === 'directory'
    ? selected.path
    : parentPath(selected.path);
  return directory ? `${directory}/` : '';
}

function readableError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function resetPanel(): void {
  mode.value = '';
  pathInput.value = '';
  confirmationInput.value = '';
  preview.value = undefined;
  errorMessage.value = '';
}

function openMode(nextMode: Exclude<MutationMode, ''>): void {
  mode.value = nextMode;
  preview.value = undefined;
  confirmationInput.value = '';
  errorMessage.value = '';
  if (nextMode === 'create-file' || nextMode === 'create-directory') {
    pathInput.value = createBasePath();
  } else if (nextMode === 'rename') {
    pathInput.value = props.selected?.path ?? '';
  } else {
    pathInput.value = '';
  }
}

async function createEntry(): Promise<void> {
  const path = pathInput.value.trim();
  if (!path || busy.value || !isCreate.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    const result = await createProjectFileEntry(props.projectId, {
      path,
      kind: mode.value === 'create-file' ? 'file' : 'directory',
      ...(mode.value === 'create-file' ? { content: '' } : {}),
    });
    emit('completed', result);
    resetPanel();
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'Não foi possível criar o item.',
    );
  } finally {
    busy.value = false;
  }
}

async function prepareMutation(): Promise<void> {
  const selected = props.selected;
  if (
    !selected
    || props.blocked
    || busy.value
    || (mode.value !== 'rename' && mode.value !== 'delete')
  ) return;

  const destinationPath = pathInput.value.trim();
  if (mode.value === 'rename' && !destinationPath) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    preview.value = await previewProjectFileMutation(props.projectId, {
      operation: mode.value,
      path: selected.path,
      ...(mode.value === 'rename' ? { destinationPath } : {}),
    });
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'Não foi possível revisar a operação.',
    );
  } finally {
    busy.value = false;
  }
}

async function applyMutation(): Promise<void> {
  const currentPreview = preview.value;
  if (!currentPreview || busy.value) return;
  busy.value = true;
  errorMessage.value = '';
  try {
    const result = await applyProjectFileMutation(props.projectId, {
      confirmationToken: currentPreview.confirmationToken,
      ...(currentPreview.requiresPhrase
        ? { confirmationPhrase: confirmationInput.value }
        : {}),
    });
    emit('completed', result);
    resetPanel();
  } catch (error) {
    preview.value = undefined;
    confirmationInput.value = '';
    errorMessage.value = readableError(
      error,
      'Não foi possível concluir a operação.',
    );
  } finally {
    busy.value = false;
  }
}

function impactLabel(value: ProjectFileMutationPreview): string {
  const parts: string[] = [];
  if (value.affectedFiles) {
    parts.push(`${value.affectedFiles} arquivo${value.affectedFiles === 1 ? '' : 's'}`);
  }
  if (value.affectedDirectories) {
    parts.push(
      `${value.affectedDirectories} pasta${value.affectedDirectories === 1 ? '' : 's'}`,
    );
  }
  return parts.join(' e ') || '1 item';
}

watch(
  () => props.selected?.path,
  () => {
    if (mode.value === 'rename' || mode.value === 'delete') resetPanel();
  },
);
</script>

<template>
  <div class="file-mutation">
    <div class="file-mutation-toolbar" aria-label="Ações do explorer">
      <button type="button" aria-label="Criar arquivo" @click="openMode('create-file')">
        <DocumentPlusIcon aria-hidden="true" />
      </button>
      <button type="button" aria-label="Criar pasta" @click="openMode('create-directory')">
        <FolderPlusIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Renomear item selecionado"
        :disabled="!selected || blocked"
        @click="openMode('rename')"
      >
        <PencilSquareIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Excluir item selecionado"
        :disabled="!selected || blocked"
        @click="openMode('delete')"
      >
        <TrashIcon aria-hidden="true" />
      </button>
      <span :title="selectedLabel">{{ selected?.name ?? 'Explorer' }}</span>
    </div>

    <div v-if="mode" class="file-mutation-panel">
      <header>
        <strong>{{ title }}</strong>
        <button type="button" aria-label="Fechar ação" @click="resetPanel">
          <XMarkIcon aria-hidden="true" />
        </button>
      </header>

      <p v-if="blocked" class="file-mutation-warning">
        Salve ou descarte as alterações abertas neste caminho antes de continuar.
      </p>
      <p v-if="errorMessage" class="file-mutation-error" role="alert">
        {{ errorMessage }}
      </p>

      <form v-if="isCreate" @submit.prevent="createEntry">
        <label>
          Caminho relativo
          <input
            v-model="pathInput"
            autocomplete="off"
            :placeholder="mode === 'create-file' ? 'src/novo-arquivo.ts' : 'src/nova-pasta'"
          >
        </label>
        <button type="submit" :disabled="!pathInput.trim() || busy">
          {{ busy ? 'Criando…' : 'Criar' }}
        </button>
      </form>

      <form
        v-else-if="!preview"
        @submit.prevent="prepareMutation"
      >
        <p class="file-mutation-target">{{ selectedLabel }}</p>
        <label v-if="mode === 'rename'">
          Novo caminho
          <input v-model="pathInput" autocomplete="off">
        </label>
        <button
          type="submit"
          :disabled="blocked || busy || (mode === 'rename' && !pathInput.trim())"
        >
          {{ busy ? 'Revisando…' : 'Revisar' }}
        </button>
      </form>

      <form v-else @submit.prevent="applyMutation">
        <p class="file-mutation-preview">
          <template v-if="preview.operation === 'rename'">
            <strong>{{ preview.path }}</strong>
            <span>será movido para</span>
            <strong>{{ preview.destinationPath }}</strong>
          </template>
          <template v-else>
            <strong>{{ preview.path }}</strong>
            <span>será excluído permanentemente.</span>
          </template>
          <small>Impacto: {{ impactLabel(preview) }}.</small>
        </p>
        <label v-if="preview.requiresPhrase">
          Digite {{ preview.confirmationPhrase }}
          <input v-model="confirmationInput" autocomplete="off">
        </label>
        <div class="file-mutation-confirm-actions">
          <button type="button" @click="preview = undefined">
            Voltar
          </button>
          <button
            type="submit"
            class="file-mutation-danger"
            :disabled="busy || (preview.requiresPhrase && confirmationInput !== preview.confirmationPhrase)"
          >
            {{ busy ? 'Aplicando…' : (preview.operation === 'delete' ? 'Excluir' : 'Renomear') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.file-mutation {
  position: relative;
  border-bottom: 1px solid var(--border);
}

.file-mutation-toolbar {
  display: grid;
  grid-template-columns: repeat(4, 28px) minmax(0, 1fr);
  align-items: center;
  gap: 3px;
  padding: 6px 10px;
}

.file-mutation-toolbar button,
.file-mutation-panel header button {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: var(--text-muted);
  background: transparent;
  place-items: center;
  cursor: pointer;
}

.file-mutation-toolbar button:hover:not(:disabled),
.file-mutation-toolbar button:focus-visible,
.file-mutation-panel header button:hover,
.file-mutation-panel header button:focus-visible {
  outline: none;
  color: var(--text);
  background: var(--accent-soft);
}

.file-mutation-toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.file-mutation-toolbar svg,
.file-mutation-panel header svg {
  width: 16px;
  height: 16px;
}

.file-mutation-toolbar > span {
  overflow: hidden;
  color: var(--text-muted);
  font-size: var(--font-xs);
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-mutation-panel {
  display: grid;
  gap: 9px;
  margin: 0 8px 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  box-shadow: var(--shadow-sm);
}

.file-mutation-panel header,
.file-mutation-confirm-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.file-mutation-panel header strong,
.file-mutation-panel label,
.file-mutation-target,
.file-mutation-preview {
  font-size: var(--font-xs);
}

.file-mutation-panel form,
.file-mutation-preview {
  display: grid;
  gap: 8px;
  margin: 0;
}

.file-mutation-panel label {
  display: grid;
  gap: 5px;
  color: var(--text-muted);
}

.file-mutation-panel input {
  min-width: 0;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-1);
  font: inherit;
  font-size: var(--font-sm);
}

.file-mutation-panel input:focus {
  border-color: var(--accent);
  outline: 2px solid var(--accent-soft);
}

.file-mutation-panel form > button,
.file-mutation-confirm-actions button {
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-1);
  font: inherit;
  font-size: var(--font-xs);
  cursor: pointer;
}

.file-mutation-panel form > button:disabled,
.file-mutation-confirm-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-mutation-target,
.file-mutation-warning,
.file-mutation-error {
  margin: 0;
}

.file-mutation-target,
.file-mutation-preview small {
  overflow-wrap: anywhere;
  color: var(--text-muted);
}

.file-mutation-preview span,
.file-mutation-preview small {
  display: block;
}

.file-mutation-warning,
.file-mutation-error {
  font-size: var(--font-xs);
}

.file-mutation-warning {
  color: var(--warning-text, var(--text-muted));
}

.file-mutation-error {
  color: var(--danger);
}

.file-mutation-confirm-actions {
  justify-content: flex-end;
}

.file-mutation-confirm-actions .file-mutation-danger {
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
  color: var(--danger);
}
</style>
