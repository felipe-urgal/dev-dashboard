<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import {
  fetchDirectories,
  type DirectoryListing,
} from '../api';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { RequestGeneration } from '../utils/request-generation';

const props = defineProps<{
  open: boolean;
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  close: [];
}>();

const listing = ref<DirectoryListing | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const closeButton = ref<HTMLButtonElement | null>(null);

useAutoDismiss(errorMessage, '');

const directoryRequests = new RequestGeneration();
let previousBodyOverflow = '';
let previouslyFocusedElement: HTMLElement | null = null;
let pageStateCaptured = false;

async function loadDirectory(
  directoryPath?: string,
): Promise<void> {
  const requestGeneration = directoryRequests.invalidate();
  loading.value = true;
  errorMessage.value = '';

  try {
    const nextListing = await fetchDirectories(directoryPath);

    if (directoryRequests.isCurrent(requestGeneration)) {
      listing.value = nextListing;
    }
  } catch (error) {
    if (directoryRequests.isCurrent(requestGeneration)) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível listar os diretórios.';
    }
  } finally {
    if (directoryRequests.isCurrent(requestGeneration)) {
      loading.value = false;
    }
  }
}

function restorePageState(): void {
  if (!pageStateCaptured) {
    return;
  }

  pageStateCaptured = false;
  document.body.style.overflow = previousBodyOverflow;
  document.removeEventListener('keydown', handleKeydown);

  const focusTarget = previouslyFocusedElement;
  previouslyFocusedElement = null;

  void nextTick(() => {
    focusTarget?.focus();
  });
}

function closeDirectoryPicker(): void {
  directoryRequests.invalidate();
  loading.value = false;
  restorePageState();
  emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDirectoryPicker();
  }
}

function selectCurrentDirectory(): void {
  if (!listing.value) {
    return;
  }

  emit('update:modelValue', listing.value.currentPath);
  closeDirectoryPicker();
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      previousBodyOverflow = document.body.style.overflow;
      pageStateCaptured = true;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeydown);

      void loadDirectory(props.modelValue || undefined);

      await nextTick();
      closeButton.value?.focus();
      return;
    }

    directoryRequests.invalidate();
    restorePageState();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  directoryRequests.invalidate();
  restorePageState();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop"
      role="presentation"
      @click.self="closeDirectoryPicker"
    >
      <section
        class="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-picker-title"
        :aria-busy="loading"
      >
        <header class="modal-header">
          <div>
            <span class="section-kicker">Workspace</span>
            <h3 id="directory-picker-title">Escolher pasta</h3>
          </div>

          <button
            ref="closeButton"
            type="button"
            class="log-action-button"
            @click="closeDirectoryPicker"
          >
            Fechar
          </button>
        </header>

        <code v-if="listing" class="modal-path">
          {{ listing.currentPath }}
        </code>

        <div v-if="errorMessage" class="project-error" role="alert">
          {{ errorMessage }}
        </div>

        <div class="modal-toolbar">
          <button
            type="button"
            class="secondary-button"
            :disabled="loading || !listing?.parentPath"
            @click="loadDirectory(listing?.parentPath ?? undefined)"
          >
            ← Pasta anterior
          </button>

          <button
            type="button"
            class="primary-button"
            :disabled="loading || !listing"
            @click="selectCurrentDirectory"
          >
            Usar esta pasta
          </button>
        </div>

        <div class="directory-picker-list">
          <div v-if="loading" class="directory-picker-empty">
            Carregando pastas...
          </div>

          <template v-else>
            <button
              v-for="directory in listing?.directories ?? []"
              :key="directory.path"
              type="button"
              class="directory-picker-item"
              :disabled="loading"
              @click="loadDirectory(directory.path)"
            >
              <span>▸</span>
              <strong>{{ directory.name }}</strong>
            </button>

            <div
              v-if="listing?.directories.length === 0"
              class="directory-picker-empty"
            >
              Nenhuma subpasta acessível.
            </div>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>
