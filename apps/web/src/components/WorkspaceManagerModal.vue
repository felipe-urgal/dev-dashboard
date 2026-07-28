<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import { dashboardStore } from '../stores/dashboard';
import WorkspaceDirectoryPicker from './WorkspaceDirectoryPicker.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  newWorkspaceName,
  newWorkspacePath,
  creatingWorkspace,
  errorMessage,
  successMessage,
  handleCreateWorkspace,
} = dashboardStore;

const directoryPickerOpen = ref(false);
const closeButton = ref<HTMLButtonElement | null>(null);

let previousBodyOverflow = '';
let previouslyFocusedElement: HTMLElement | null = null;
let pageStateCaptured = false;

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

function closeModal(): void {
  restorePageState();
  emit('close');
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
  }
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

      await nextTick();
      closeButton.value?.focus();
      return;
    }

    restorePageState();
  },
);

onBeforeUnmount(() => {
  restorePageState();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop modal-backdrop-center"
      role="presentation"
      @click.self="closeModal"
    >
      <section
        class="modal-dialog workspace-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-manager-title"
      >
        <header class="modal-header">
          <div>
            <span class="section-kicker">Workspaces</span>
            <h3 id="workspace-manager-title">Adicionar workspace</h3>
          </div>

          <button
            ref="closeButton"
            type="button"
            class="log-action-button"
            @click="closeModal"
          >
            Fechar
          </button>
        </header>

        <div v-if="errorMessage" class="alert alert-error" role="alert">
          <div class="alert-body">
            <strong>Não foi possível concluir a ação.</strong>
            <span>{{ errorMessage }}</span>
          </div>
          <button
            type="button"
            class="alert-dismiss"
            aria-label="Fechar aviso"
            @click="errorMessage = ''"
          >
            ×
          </button>
        </div>

        <div v-if="successMessage" class="alert alert-success" role="status">
          <div class="alert-body">
            <strong>Ação concluída.</strong>
            <span>{{ successMessage }}</span>
          </div>
          <button
            type="button"
            class="alert-dismiss"
            aria-label="Fechar aviso"
            @click="successMessage = ''"
          >
            ×
          </button>
        </div>

        <form
          class="workspace-create-form"
          @submit.prevent="handleCreateWorkspace"
        >
          <label class="workspace-field">
            <span>Nome</span>
            <input
              v-model="newWorkspaceName"
              autocomplete="off"
              placeholder="Projetos pessoais"
            />
          </label>

          <label class="workspace-field">
            <span>Caminho local</span>
            <div class="workspace-path-picker-field">
              <input
                v-model="newWorkspacePath"
                autocomplete="off"
                placeholder="/home/usuario/projetos"
              />

              <button
                type="button"
                class="secondary-button"
                @click="directoryPickerOpen = true"
              >
                Escolher pasta
              </button>
            </div>
          </label>

          <button
            class="secondary-primary-button"
            type="submit"
            :disabled="creatingWorkspace"
          >
            {{ creatingWorkspace ? 'Cadastrando...' : 'Adicionar workspace' }}
          </button>
        </form>
      </section>
    </div>

    <WorkspaceDirectoryPicker
      v-model="newWorkspacePath"
      :open="directoryPickerOpen"
      @close="directoryPickerOpen = false"
    />
  </Teleport>
</template>
