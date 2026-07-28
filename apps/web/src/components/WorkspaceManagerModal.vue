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
  selectedWorkspace,
  newWorkspaceName,
  newWorkspacePath,
  scanningWorkspace,
  creatingWorkspace,
  deletingWorkspace,
  scanSelectedWorkspace,
  handleCreateWorkspace,
  handleDeleteWorkspace,
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
      class="modal-backdrop"
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
            <h3 id="workspace-manager-title">Gerenciar workspaces</h3>
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

        <template v-if="selectedWorkspace">
          <code class="modal-path">{{ selectedWorkspace.path }}</code>

          <div class="workspace-actions">
            <button
              class="primary-button"
              type="button"
              :disabled="scanningWorkspace"
              @click="scanSelectedWorkspace"
            >
              {{ scanningWorkspace ? 'Escaneando...' : 'Escanear novamente' }}
            </button>

            <button
              class="danger-button"
              type="button"
              :disabled="deletingWorkspace"
              @click="handleDeleteWorkspace"
            >
              {{ deletingWorkspace ? 'Removendo...' : 'Remover' }}
            </button>
          </div>

          <div class="workspace-divider">Adicionar outro workspace</div>
        </template>

        <div v-else class="workspace-empty">
          Nenhum workspace foi cadastrado.
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
