<script setup lang="ts">
import {
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import {
  fetchDirectories,
  type DirectoryListing,
} from '../api';

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

async function loadDirectory(
  directoryPath?: string,
): Promise<void> {
  loading.value = true;
  errorMessage.value = '';

  try {
    listing.value = await fetchDirectories(directoryPath);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível listar os diretórios.';
  } finally {
    loading.value = false;
  }
}

function closeDirectoryPicker(): void {
  document.body.style.overflow = '';
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
    document.body.style.overflow = open
      ? 'hidden'
      : '';

    if (open) {
      void loadDirectory(
        props.modelValue || undefined,
      );
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="directory-picker-backdrop"
      role="presentation"
      @click.self="closeDirectoryPicker"
    >
      <section
        class="directory-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="directory-picker-title"
      >
        <header class="directory-picker-header">
          <div>
            <span class="section-kicker">Workspace</span>
            <h3 id="directory-picker-title">Escolher pasta</h3>
          </div>

          <button
            type="button"
            class="log-action-button"
            @click="closeDirectoryPicker"
          >
            Fechar
          </button>
        </header>

        <code v-if="listing" class="directory-picker-path">
          {{ listing.currentPath }}
        </code>

        <div v-if="errorMessage" class="project-error" role="alert">
          {{ errorMessage }}
        </div>

        <div class="directory-picker-toolbar">
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
