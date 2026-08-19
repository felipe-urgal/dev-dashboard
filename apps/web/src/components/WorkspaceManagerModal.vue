<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NInput, NModal, NSwitch } from 'naive-ui';

import { dashboardStore } from '../stores/dashboard';
import WorkspaceDirectoryPicker from './WorkspaceDirectoryPicker.vue';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  workspaces,
  newWorkspaceName,
  newWorkspacePath,
  newWorkspaceRecursiveScan,
  creatingWorkspace,
  recursiveScanUpdatingIds,
  handleCreateWorkspace,
  handleDeleteWorkspace,
  handleRenameWorkspace,
  toggleWorkspaceRecursiveScan,
  deletingWorkspace,
} = dashboardStore;

const directoryPickerOpen = ref(false);
const editingWorkspaceId = ref('');
const editingWorkspaceName = ref('');

function closeModal(): void {
  emit('close');
}

function handleShowUpdate(show: boolean): void {
  if (!show) closeModal();
}

function beginRename(workspace: { id: string; name: string }): void {
  editingWorkspaceId.value = workspace.id;
  editingWorkspaceName.value = workspace.name;
}

function cancelRename(): void {
  editingWorkspaceId.value = '';
  editingWorkspaceName.value = '';
}

async function saveRename(workspaceId: string): Promise<void> {
  await handleRenameWorkspace(workspaceId, editingWorkspaceName.value);
  if (!dashboardStore.errorMessage.value) cancelRename();
}

async function removeWorkspace(workspaceId: string): Promise<void> {
  await handleDeleteWorkspace(workspaceId);
  if (!dashboardStore.errorMessage.value) cancelRename();
}
</script>

<template>
  <NModal
    :show="open"
    preset="card"
    to="body"
    class="workspace-manager-dialog"
    title="Adicionar workspace"
    :bordered="false"
    role="dialog"
    aria-modal="true"
    @update:show="handleShowUpdate"
  >
    <template #header-extra>
      <span class="section-kicker">Workspaces</span>
    </template>

    <section
      v-if="workspaces.length > 0"
      class="workspace-existing-list"
      aria-labelledby="workspace-existing-title"
    >
      <h4 id="workspace-existing-title">Workspaces cadastrados</h4>

      <ul>
        <li
          v-for="workspace in workspaces"
          :key="workspace.id"
          class="settings-row workspace-existing-row"
        >
          <span v-if="editingWorkspaceId !== workspace.id" class="settings-row-copy">
            <strong
              :id="`workspace-existing-recursive-scan-label-${workspace.id}`"
              >{{ workspace.name }}</strong
            >
            <span
              :id="`workspace-existing-recursive-scan-description-${workspace.id}`"
              >{{ workspace.path }} — escanear subdiretórios (monorepos)</span
            >
          </span>
          <span v-else class="workspace-rename-control">
            <NInput
              v-model:value="editingWorkspaceName"
              :aria-label="`Novo nome para ${workspace.name}`"
              @keyup.enter="saveRename(workspace.id)"
              @keyup.esc="cancelRename"
            />
            <NButton size="small" type="primary" @click="saveRename(workspace.id)">
              Salvar
            </NButton>
            <NButton size="small" secondary @click="cancelRename">
              Cancelar
            </NButton>
          </span>
          <span class="settings-switch-control">
            <NSwitch
              :value="workspace.recursiveScan"
              :disabled="recursiveScanUpdatingIds.includes(workspace.id)"
              :aria-labelledby="`workspace-existing-recursive-scan-label-${workspace.id}`"
              :aria-describedby="`workspace-existing-recursive-scan-description-${workspace.id}`"
              @update:value="toggleWorkspaceRecursiveScan(workspace)"
            />
            <span>{{
              workspace.recursiveScan ? 'Ativado' : 'Desativado'
            }}</span>
          </span>
          <span v-if="editingWorkspaceId !== workspace.id" class="workspace-row-actions">
            <NButton size="small" secondary @click="beginRename(workspace)">
              Renomear
            </NButton>
            <NButton
              size="small"
              tertiary
              type="error"
              :loading="deletingWorkspace"
              @click="removeWorkspace(workspace.id)"
            >
              Remover
            </NButton>
          </span>
        </li>
      </ul>
    </section>

    <p
      v-if="dashboardStore.errorMessage"
      class="workspace-form-message workspace-form-error"
      role="alert"
    >
      {{ dashboardStore.errorMessage }}
    </p>
    <p
      v-if="dashboardStore.successMessage"
      class="workspace-form-message workspace-form-success"
      role="status"
    >
      {{ dashboardStore.successMessage }}
    </p>

    <form class="workspace-create-form" @submit.prevent="handleCreateWorkspace">
      <label class="workspace-field">
        <span>Nome</span>
        <NInput
          v-model:value="newWorkspaceName"
          autocomplete="off"
          placeholder="Projetos pessoais"
        />
      </label>

      <label class="workspace-field">
        <span>Caminho local</span>
        <div class="workspace-path-picker-field">
          <NInput
            v-model:value="newWorkspacePath"
            autocomplete="off"
            placeholder="/home/usuario/projetos"
          />

          <NButton
            attr-type="button"
            secondary
            @click="directoryPickerOpen = true"
          >
            Escolher pasta
          </NButton>
        </div>
      </label>

      <label class="settings-row workspace-recursive-scan-field">
        <span class="settings-row-copy">
          <strong id="workspace-recursive-scan-label"
            >Escanear subdiretórios (monorepos)</strong
          >
          <span id="workspace-recursive-scan-description"
            >Procura projetos em subpastas além dos filhos diretos. Pode deixar
            o cadastro mais lento em workspaces grandes.</span
          >
        </span>
        <span class="settings-switch-control">
          <NSwitch
            v-model:value="newWorkspaceRecursiveScan"
            aria-labelledby="workspace-recursive-scan-label"
            aria-describedby="workspace-recursive-scan-description"
          />
          <span>{{
            newWorkspaceRecursiveScan ? 'Ativado' : 'Desativado'
          }}</span>
        </span>
      </label>

      <NButton
        type="primary"
        attr-type="submit"
        :loading="creatingWorkspace"
        :disabled="creatingWorkspace"
      >
        {{ creatingWorkspace ? 'Cadastrando...' : 'Adicionar workspace' }}
      </NButton>
    </form>
  </NModal>

  <WorkspaceDirectoryPicker
    v-model="newWorkspacePath"
    :open="directoryPickerOpen"
    @close="directoryPickerOpen = false"
  />
</template>
