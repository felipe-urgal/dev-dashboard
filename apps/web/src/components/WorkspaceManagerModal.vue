<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  EllipsisHorizontalIcon,
  FolderIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline';
import { NButton, NDropdown, NInput, NModal, NSwitch } from 'naive-ui';

import { dashboardStore } from '../stores/dashboard';
import WorkspaceDirectoryPicker from './WorkspaceDirectoryPicker.vue';

const props = defineProps<{
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
  errorMessage,
  successMessage,
} = dashboardStore;

type WorkspaceTab = 'add' | 'manage';

const activeTab = ref<WorkspaceTab>('add');
const directoryPickerOpen = ref(false);
const editingWorkspaceId = ref('');
const editingWorkspaceName = ref('');

const workspaceMenuOptions = [
  { label: 'Renomear', key: 'rename' },
  { label: 'Remover', key: 'remove' },
];

function closeModal(): void {
  emit('close');
}

function handleShowUpdate(show: boolean): void {
  if (!show) closeModal();
}

function selectTab(tab: WorkspaceTab): void {
  activeTab.value = tab;
  cancelRename();
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
  if (!errorMessage.value) cancelRename();
}

async function removeWorkspace(workspaceId: string): Promise<void> {
  await handleDeleteWorkspace(workspaceId);
  if (!errorMessage.value) cancelRename();
}

async function handleWorkspaceMenuAction(
  key: string | number,
  workspace: { id: string; name: string },
): Promise<void> {
  if (key === 'rename') {
    beginRename(workspace);
    return;
  }

  if (key === 'remove') await removeWorkspace(workspace.id);
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      activeTab.value = 'add';
      cancelRename();
      return;
    }

    directoryPickerOpen.value = false;
    cancelRename();
  },
);
</script>

<template>
  <NModal
    :show="open"
    preset="card"
    to="body"
    class="workspace-manager-dialog workspace-manager-tabs-dialog"
    :bordered="false"
    role="dialog"
    aria-modal="true"
    aria-label="Workspaces"
    @update:show="handleShowUpdate"
  >
    <template #header>
      <div class="workspace-manager-header">
        <strong>{{
          activeTab === 'add' ? 'Adicionar workspace' : 'Gerenciar workspaces'
        }}</strong>
        <span>
          {{
            activeTab === 'add'
              ? 'Cadastre uma pasta local para acompanhar seus projetos.'
              : 'Renomeie, remova ou ajuste a busca em subdiretórios.'
          }}
        </span>
      </div>
    </template>

    <div
      class="workspace-manager-tabs"
      role="tablist"
      aria-label="Ações de workspace"
    >
      <button
        id="workspace-add-tab"
        type="button"
        class="workspace-manager-tab"
        :class="{ 'workspace-manager-tab-active': activeTab === 'add' }"
        role="tab"
        :aria-selected="activeTab === 'add'"
        aria-controls="workspace-add-panel"
        @click="selectTab('add')"
      >
        Adicionar
      </button>
      <button
        id="workspace-manage-tab"
        type="button"
        class="workspace-manager-tab"
        :class="{ 'workspace-manager-tab-active': activeTab === 'manage' }"
        role="tab"
        :aria-selected="activeTab === 'manage'"
        aria-controls="workspace-manage-panel"
        @click="selectTab('manage')"
      >
        Gerenciar
        <span class="workspace-manager-tab-count">{{ workspaces.length }}</span>
      </button>
    </div>

    <p
      v-if="errorMessage"
      class="workspace-form-message workspace-form-error"
      role="alert"
    >
      {{ errorMessage }}
    </p>
    <p
      v-if="successMessage"
      class="workspace-form-message workspace-form-success"
      role="status"
    >
      {{ successMessage }}
    </p>

    <section
      v-if="activeTab === 'add'"
      id="workspace-add-panel"
      class="workspace-manager-panel"
      role="tabpanel"
      aria-labelledby="workspace-add-tab"
      tabindex="0"
    >
      <form
        class="workspace-create-form"
        @submit.prevent="handleCreateWorkspace"
      >
        <label class="workspace-field">
          <span>Nome</span>
          <NInput
            v-model:value="newWorkspaceName"
            autocomplete="off"
            placeholder="Ex.: Projetos Pessoais"
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
              class="workspace-choose-folder-button"
              attr-type="button"
              secondary
              @click="directoryPickerOpen = true"
            >
              Escolher pasta
            </NButton>
          </div>
        </label>

        <label class="settings-row workspace-recursive-scan-field">
          <span class="workspace-recursive-scan-icon" aria-hidden="true">
            <FolderIcon />
          </span>
          <span class="settings-row-copy">
            <strong id="workspace-recursive-scan-label"
              >Escanear subdiretórios (monorepos)</strong
            >
            <span id="workspace-recursive-scan-description"
              >Procura projetos em subpastas além dos filhos diretos.</span
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

        <div class="workspace-modal-actions workspace-create-actions">
          <NButton
            class="workspace-cancel-button"
            attr-type="button"
            secondary
            @click="closeModal"
          >
            Cancelar
          </NButton>
          <NButton
            class="workspace-create-submit"
            type="primary"
            attr-type="submit"
            :loading="creatingWorkspace"
            :disabled="creatingWorkspace"
          >
            {{ creatingWorkspace ? 'Cadastrando...' : 'Adicionar workspace' }}
          </NButton>
        </div>
      </form>
    </section>

    <section
      v-else
      id="workspace-manage-panel"
      class="workspace-manager-panel workspace-manage-panel"
      role="tabpanel"
      aria-labelledby="workspace-manage-tab"
      tabindex="0"
    >
      <p v-if="workspaces.length === 0" class="workspace-manager-empty">
        Nenhum workspace cadastrado ainda.
      </p>

      <ul v-else class="workspace-manage-list">
        <li
          v-for="workspace in workspaces"
          :key="workspace.id"
          class="settings-row workspace-existing-row workspace-manage-row"
        >
          <template v-if="editingWorkspaceId !== workspace.id">
            <FolderIcon class="workspace-manage-icon" aria-hidden="true" />

            <span class="settings-row-copy workspace-manage-copy">
              <strong
                :id="'workspace-existing-recursive-scan-label-' + workspace.id"
                >{{ workspace.name }}</strong
              >
              <span
                :id="
                  'workspace-existing-recursive-scan-description-' +
                  workspace.id
                "
                >{{ workspace.path }}</span
              >
            </span>

            <span class="settings-switch-control workspace-manage-switch">
              <NSwitch
                :value="workspace.recursiveScan"
                :disabled="recursiveScanUpdatingIds.includes(workspace.id)"
                :aria-labelledby="
                  'workspace-existing-recursive-scan-label-' + workspace.id
                "
                :aria-describedby="
                  'workspace-existing-recursive-scan-description-' +
                  workspace.id
                "
                @update:value="toggleWorkspaceRecursiveScan(workspace)"
              />
              <span>{{ workspace.recursiveScan ? 'Monorepo' : 'Direto' }}</span>
            </span>

            <NDropdown
              trigger="click"
              :options="workspaceMenuOptions"
              @select="(key) => handleWorkspaceMenuAction(key, workspace)"
            >
              <NButton
                class="workspace-manage-menu-button"
                quaternary
                circle
                :loading="deletingWorkspace"
                :aria-label="'Ações de ' + workspace.name"
              >
                <template #icon>
                  <EllipsisHorizontalIcon aria-hidden="true" />
                </template>
              </NButton>
            </NDropdown>
          </template>

          <div v-else class="workspace-rename-control workspace-rename-inline">
            <NInput
              v-model:value="editingWorkspaceName"
              :aria-label="'Novo nome para ' + workspace.name"
              @keyup.enter="saveRename(workspace.id)"
              @keyup.esc="cancelRename"
            />
            <NButton
              size="small"
              type="primary"
              @click="saveRename(workspace.id)"
            >
              Salvar
            </NButton>
            <NButton size="small" secondary @click="cancelRename">
              Cancelar
            </NButton>
          </div>
        </li>
      </ul>

      <div class="workspace-modal-actions workspace-manage-actions">
        <NButton
          class="workspace-add-another-button"
          secondary
          @click="selectTab('add')"
        >
          <template #icon>
            <PlusIcon aria-hidden="true" />
          </template>
          Adicionar novo workspace
        </NButton>
        <NButton class="workspace-done-button" secondary @click="closeModal">
          Concluir
        </NButton>
      </div>
    </section>
  </NModal>

  <WorkspaceDirectoryPicker
    v-model="newWorkspacePath"
    :open="directoryPickerOpen"
    @close="directoryPickerOpen = false"
  />
</template>

<style>
.workspace-manager-tabs-dialog {
  width: min(640px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-lg) !important;
  background: color-mix(
    in srgb,
    var(--surface-1) 72%,
    var(--surface-2) 28%
  ) !important;
  box-shadow: var(--shadow-2) !important;
}

.workspace-manager-tabs-dialog .n-card-header {
  padding: 20px 22px 14px;
}

.workspace-manager-tabs-dialog .n-card__content {
  overflow-y: auto;
  padding: 0 22px 22px;
}

.workspace-manager-tabs-dialog .n-card-header__close {
  color: var(--text-muted);
}

.workspace-manager-header {
  display: grid;
  gap: 4px;
}

.workspace-manager-header strong {
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.workspace-manager-header span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: var(--font-weight-body);
  line-height: 1.45;
}

.workspace-manager-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 18px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-0);
}

.workspace-manager-tab {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: var(--font-weight-strong);
  cursor: pointer;
  transition:
    color var(--motion-duration-fast) var(--motion-easing-standard),
    border-color var(--motion-duration-fast) var(--motion-easing-standard),
    background var(--motion-duration-fast) var(--motion-easing-standard);
}

.workspace-manager-tab:hover {
  color: var(--text);
  background: var(--surface-2);
}

.workspace-manager-tab:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.workspace-manager-tab-active {
  border-color: color-mix(in srgb, var(--accent) 62%, var(--border));
  color: var(--info-text);
  background: color-mix(in srgb, var(--accent-soft) 72%, var(--surface-1));
}

.workspace-manager-tab-count {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  padding-inline: 5px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
}

.workspace-manager-tab-active .workspace-manager-tab-count {
  color: var(--info-text);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
}

.workspace-manager-panel {
  display: grid;
  gap: 16px;
  outline: none;
}

.workspace-manager-tabs-dialog .workspace-create-form {
  display: grid;
  gap: 16px;
}

.workspace-manager-tabs-dialog .workspace-field {
  display: grid;
  gap: 7px;
}

.workspace-manager-tabs-dialog .workspace-field > span {
  color: var(--text);
  font-size: 11px;
  font-weight: var(--font-weight-strong);
}

.workspace-manager-tabs-dialog .n-input {
  --n-color: var(--surface-0) !important;
  --n-color-focus: var(--surface-0) !important;
  --n-border: 1px solid var(--border) !important;
  --n-border-hover: 1px solid var(--border-strong) !important;
  --n-border-focus: 1px solid var(--accent) !important;
  --n-box-shadow-focus: 0 0 0 2px
    color-mix(in srgb, var(--accent) 18%, transparent) !important;
  --n-text-color: var(--text) !important;
  --n-placeholder-color: var(--text-muted) !important;
}

.workspace-manager-tabs-dialog .workspace-path-picker-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.workspace-manager-tabs-dialog .workspace-choose-folder-button,
.workspace-manager-tabs-dialog .workspace-cancel-button,
.workspace-manager-tabs-dialog .workspace-done-button {
  border-color: var(--border) !important;
  color: var(--text) !important;
  background: var(--surface-0) !important;
}

.workspace-manager-tabs-dialog
  :is(
    .workspace-choose-folder-button,
    .workspace-cancel-button,
    .workspace-done-button
  ):hover {
  border-color: var(--border-strong) !important;
  background: var(--surface-2) !important;
}

.workspace-manager-tabs-dialog .workspace-recursive-scan-field {
  grid-template-columns: 24px minmax(0, 1fr) auto;
  min-height: 0;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-0);
}

.workspace-recursive-scan-icon {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  color: var(--text-muted);
}

.workspace-recursive-scan-icon svg {
  width: 18px;
  height: 18px;
}

.workspace-manager-tabs-dialog
  .workspace-recursive-scan-field
  .settings-row-copy {
  gap: 4px;
}

.workspace-manager-tabs-dialog
  .workspace-recursive-scan-field
  .settings-row-copy
  > span {
  max-width: 38ch;
}

.workspace-manager-tabs-dialog .settings-switch-control {
  color: var(--text-muted);
  font-size: 10px;
}

.workspace-manager-tabs-dialog .n-switch {
  --n-rail-color-active: var(--accent-strong) !important;
}

.workspace-modal-actions {
  display: grid;
  gap: 10px;
  padding-top: 2px;
}

.workspace-create-actions {
  grid-template-columns: minmax(130px, 0.72fr) minmax(220px, 1.28fr);
}

.workspace-manager-tabs-dialog .workspace-create-submit {
  min-height: 40px;
  border-color: var(--accent-strong) !important;
  color: #fff !important;
  background: var(--accent-strong) !important;
}

.workspace-manager-tabs-dialog .workspace-create-submit:hover:not(:disabled) {
  border-color: var(--accent) !important;
  background: var(--accent) !important;
}

.workspace-manage-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workspace-manager-tabs-dialog .workspace-manage-row {
  grid-template-columns: 22px minmax(0, 1fr) auto 34px;
  min-height: 0;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-0);
}

.workspace-manager-tabs-dialog .workspace-manage-row:hover {
  border-color: var(--border-strong);
}

.workspace-manage-icon {
  width: 18px;
  height: 18px;
  align-self: center;
  color: var(--text-muted);
}

.workspace-manager-tabs-dialog .workspace-manage-copy {
  gap: 4px;
  min-width: 0;
}

.workspace-manager-tabs-dialog .workspace-manage-copy > strong {
  color: var(--text);
}

.workspace-manager-tabs-dialog .workspace-manage-copy > span {
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-manager-tabs-dialog .workspace-manage-switch {
  min-width: 104px;
}

.workspace-manager-tabs-dialog .workspace-manage-menu-button {
  color: var(--text-muted);
}

.workspace-manager-tabs-dialog .workspace-manage-menu-button:hover {
  color: var(--text);
  background: var(--surface-2);
}

.workspace-manager-tabs-dialog .workspace-manage-menu-button svg {
  width: 17px;
  height: 17px;
}

.workspace-manager-tabs-dialog .workspace-rename-inline {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.workspace-manage-actions {
  grid-template-columns: minmax(0, 1fr) auto;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.workspace-manager-tabs-dialog .workspace-add-another-button {
  justify-self: stretch;
  border-color: color-mix(in srgb, var(--accent) 64%, var(--border)) !important;
  color: var(--info-text) !important;
  background: color-mix(
    in srgb,
    var(--accent-soft) 40%,
    var(--surface-0)
  ) !important;
}

.workspace-manager-tabs-dialog .workspace-add-another-button:hover {
  border-color: var(--accent) !important;
  background: color-mix(
    in srgb,
    var(--accent-soft) 72%,
    var(--surface-0)
  ) !important;
}

.workspace-manager-tabs-dialog .workspace-add-another-button svg {
  width: 16px;
  height: 16px;
}

.workspace-manager-empty {
  margin: 0;
  padding: 28px 16px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-size: 11px;
  text-align: center;
}

.workspace-manager-tabs-dialog .workspace-form-message {
  margin: 0 0 14px;
}

@media (max-width: 560px) {
  .workspace-manager-tabs-dialog {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
  }

  .workspace-manager-tabs-dialog .n-card-header {
    padding: 18px 16px 12px;
  }

  .workspace-manager-tabs-dialog .n-card__content {
    padding: 0 16px 16px;
  }

  .workspace-manager-tabs-dialog .workspace-path-picker-field,
  .workspace-manager-tabs-dialog .workspace-recursive-scan-field,
  .workspace-manager-tabs-dialog .workspace-manage-row,
  .workspace-manager-tabs-dialog .workspace-rename-inline,
  .workspace-create-actions,
  .workspace-manage-actions {
    grid-template-columns: 1fr;
  }

  .workspace-manager-tabs-dialog .workspace-manage-switch {
    min-width: 0;
    justify-content: flex-start;
  }

  .workspace-manager-tabs-dialog .workspace-manage-menu-button {
    justify-self: end;
  }

  .workspace-manager-tabs-dialog .workspace-add-another-button,
  .workspace-manager-tabs-dialog .workspace-done-button {
    width: 100%;
  }
}
</style>
