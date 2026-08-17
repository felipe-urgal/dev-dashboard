<script setup lang="ts">
import { ref, watch } from 'vue';
import { NModal } from 'naive-ui';

import { fetchDirectories, type DirectoryListing } from '../api';

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

useAutoDismiss(errorMessage, '');

const directoryRequests = new RequestGeneration();

async function loadDirectory(directoryPath?: string): Promise<void> {
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

function closeDirectoryPicker(): void {
  if (loading.value) return;
  directoryRequests.invalidate();
  loading.value = false;
  emit('close');
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
  (open) => {
    if (open) {
      void loadDirectory(props.modelValue || undefined);
      return;
    }

    directoryRequests.invalidate();
    loading.value = false;
  },
  { immediate: true },
);

</script>

<template>
  <n-modal
    :show="open"
    preset="card"
    :mask-closable="!loading"
    :close-on-esc="!loading"
    style="width: min(720px, calc(100vw - 32px))"
    aria-labelledby="directory-picker-title"
    @update:show="(show) => !show && closeDirectoryPicker()"
  >
    <div class="modal-dialog" :aria-busy="loading">
      <header class="modal-header">
        <div>
          <span class="section-kicker">Workspace</span>
          <h3 id="directory-picker-title">Escolher pasta</h3>
        </div>
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
    </div>
  </n-modal>
</template>
