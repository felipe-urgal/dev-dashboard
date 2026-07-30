<script setup lang="ts">
import {
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  LockClosedIcon,
  MinusCircleIcon,
  PencilSquareIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';

import type {
  GitBranch,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  loading: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  create: [name: string];
  switch: [name: string];
  rename: [currentName: string, nextName: string];
  delete: [name: string];
}>();

type BranchFilter = 'all' | 'local' | 'remote';
type BranchModal = 'create' | 'rename' | 'delete' | null;

interface BranchRow {
  name: string;
  local?: GitBranch;
  origin?: GitBranch;
}

interface BranchPrefix {
  value: string;
  label: string;
}

const prefixes: BranchPrefix[] = [
  { value: 'feature/', label: 'Nova função' },
  { value: 'bugfix/', label: 'Correção comum' },
  { value: 'hotfix/', label: 'Correção urgente' },
  { value: 'docs/', label: 'Documentação' },
  { value: 'refactor/', label: 'Melhoria interna' },
  { value: 'test/', label: 'Testes' },
];

const filter = ref<BranchFilter>('all');
const openMenu = ref('');
const modal = ref<BranchModal>(null);
const selectedBranch = ref('');
const branchPrefix = ref(prefixes[0]!.value);
const branchSuffix = ref('');
const renamedBranch = ref('');
const deleteConfirmation = ref('');

const rows = computed<BranchRow[]>(() => {
  const byName = new Map<string, BranchRow>();

  for (const branch of props.workspace?.branches ?? []) {
    if (branch.kind === 'remote' && branch.remote !== 'origin') continue;
    const name = branch.kind === 'local' ? branch.name : branch.shortName;
    const row = byName.get(name) ?? { name };
    if (branch.kind === 'local') row.local = branch;
    else row.origin = branch;
    byName.set(name, row);
  }

  return [...byName.values()].sort((left, right) => {
    if (left.local?.current !== right.local?.current) {
      return left.local?.current ? -1 : 1;
    }
    return left.name.localeCompare(right.name, 'pt-BR');
  });
});

const filteredRows = computed(() => rows.value.filter((row) => {
  if (filter.value === 'local') return Boolean(row.local);
  if (filter.value === 'remote') return Boolean(row.origin);
  return true;
}));

const fullBranchName = computed(() => {
  const suffix = branchSuffix.value.trim().replace(/^\/+/, '');
  return suffix ? `${branchPrefix.value}${suffix}` : branchPrefix.value;
});

const selectedRow = computed(
  () => rows.value.find((row) => row.name === selectedBranch.value),
);

const canSubmitCreate = computed(() => {
  const suffix = branchSuffix.value.trim().replace(/^\/+/, '');
  return Boolean(suffix) && fullBranchName.value.length <= 200;
});

const canSubmitRename = computed(() => {
  const nextName = renamedBranch.value.trim();
  return Boolean(nextName)
    && nextName !== selectedBranch.value
    && nextName.length <= 200;
});

const canSubmitDelete = computed(
  () => deleteConfirmation.value === selectedBranch.value,
);

function isProtected(row: BranchRow): boolean {
  return row.name === 'main' || row.name === 'master';
}

function stateLabel(row: BranchRow): string {
  if (row.local?.current) return 'Atual';
  if (row.local && row.origin) return 'Disponível';
  if (row.local) return 'Somente local';
  return 'Somente remota';
}

function stateTone(row: BranchRow): string {
  if (row.local?.current) return 'current';
  if (row.local && row.origin) return 'available';
  if (row.local) return 'local';
  return 'remote';
}

function closeMenu(): void {
  openMenu.value = '';
}

function toggleMenu(name: string): void {
  openMenu.value = openMenu.value === name ? '' : name;
}

function openCreateModal(): void {
  closeMenu();
  selectedBranch.value = '';
  branchPrefix.value = prefixes[0]!.value;
  branchSuffix.value = '';
  modal.value = 'create';
}

function openRenameModal(row: BranchRow): void {
  closeMenu();
  selectedBranch.value = row.name;
  renamedBranch.value = row.name;
  modal.value = 'rename';
}

function openDeleteModal(row: BranchRow): void {
  closeMenu();
  selectedBranch.value = row.name;
  deleteConfirmation.value = '';
  modal.value = 'delete';
}

function closeModal(): void {
  if (props.busy) return;
  modal.value = null;
}

function submitCreate(): void {
  if (!canSubmitCreate.value || props.busy) return;
  emit('create', fullBranchName.value);
  modal.value = null;
}

function submitRename(): void {
  if (!canSubmitRename.value || props.busy) return;
  emit('rename', selectedBranch.value, renamedBranch.value.trim());
  modal.value = null;
}

function submitDelete(): void {
  if (!canSubmitDelete.value || props.busy) return;
  emit('delete', selectedBranch.value);
  modal.value = null;
}

function handleDocumentClick(): void {
  closeMenu();
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (modal.value) closeModal();
  else closeMenu();
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <section class="git-branches-page">
    <div class="branch-table-card">
      <header class="branch-table-toolbar">
        <div class="branch-filter-tabs" aria-label="Filtrar branches">
          <button
            type="button"
            :class="{ active: filter === 'all' }"
            @click="filter = 'all'"
          >
            Todas
          </button>
          <button
            type="button"
            :class="{ active: filter === 'local' }"
            @click="filter = 'local'"
          >
            Locais
          </button>
          <button
            type="button"
            :class="{ active: filter === 'remote' }"
            @click="filter = 'remote'"
          >
            Remotas
          </button>
        </div>

        <span class="branch-result-count">
          {{ filteredRows.length }}
          {{ filteredRows.length === 1 ? 'branch' : 'branches' }}
        </span>

        <button
          type="button"
          class="primary-button branch-create-button"
          :disabled="busy"
          @click="openCreateModal"
        >
          <PlusIcon aria-hidden="true" />
          Nova branch
        </button>
      </header>

      <div class="branch-table-scroll">
        <div class="branch-table-header" aria-hidden="true">
          <span>Branch</span>
          <span>Local</span>
          <span>Origin</span>
          <span>Estado</span>
          <span>Ações</span>
        </div>

        <div
          v-for="row in filteredRows"
          :key="row.name"
          class="branch-table-row"
          :class="{ 'is-current': row.local?.current }"
        >
          <div class="branch-name-cell">
            <ShareIcon aria-hidden="true" />
            <strong>{{ row.name }}</strong>
            <span v-if="row.local?.current" class="branch-current-badge">
              Atual
            </span>
            <LockClosedIcon
              v-if="isProtected(row)"
              class="branch-protected-icon"
              aria-label="Branch protegida"
            />
          </div>

          <span class="branch-presence">
            <CheckCircleIcon v-if="row.local" class="is-present" aria-hidden="true" />
            <MinusCircleIcon v-else aria-hidden="true" />
            {{ row.local ? 'Sim' : 'Não' }}
          </span>

          <span class="branch-presence">
            <CheckCircleIcon v-if="row.origin" class="is-present" aria-hidden="true" />
            <MinusCircleIcon v-else aria-hidden="true" />
            {{ row.origin ? 'Sim' : 'Não' }}
          </span>

          <span class="branch-state" :class="`is-${stateTone(row)}`">
            <span aria-hidden="true" />
            {{ stateLabel(row) }}
          </span>

          <div class="branch-row-actions">
            <button
              v-if="row.local && !row.local.current"
              type="button"
              class="secondary-button"
              :disabled="busy"
              @click="emit('switch', row.name)"
            >
              Trocar
            </button>
            <span v-else-if="!row.local" class="branch-readonly">
              Somente leitura
            </span>

            <div
              v-if="row.local && !isProtected(row)"
              class="branch-action-menu"
              @click.stop
            >
              <button
                type="button"
                class="branch-menu-trigger"
                :aria-expanded="openMenu === row.name"
                :aria-label="`Ações da branch ${row.name}`"
                @click="toggleMenu(row.name)"
              >
                <EllipsisHorizontalIcon aria-hidden="true" />
              </button>

              <div
                v-if="openMenu === row.name"
                class="branch-menu-popover"
              >
                <button type="button" @click="openRenameModal(row)">
                  <PencilSquareIcon aria-hidden="true" />
                  Renomear
                </button>
                <button
                  v-if="!row.local.current"
                  type="button"
                  class="is-danger"
                  @click="openDeleteModal(row)"
                >
                  <TrashIcon aria-hidden="true" />
                  Remover branch…
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="loading" class="branch-table-empty">
          Atualizando branches…
        </div>
        <div v-else-if="filteredRows.length === 0" class="branch-table-empty">
          Nenhuma branch disponível neste filtro.
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="modal"
        class="branch-modal-backdrop"
        @click.self="closeModal"
      >
        <section
          class="branch-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`branch-${modal}-title`"
        >
          <header>
            <div>
              <h2 :id="`branch-${modal}-title`">
                {{
                  modal === 'create'
                    ? 'Nova branch'
                    : modal === 'rename'
                      ? 'Renomear branch'
                      : 'Remover branch'
                }}
              </h2>
              <p v-if="modal === 'create'">
                Será criada a partir de
                <strong>{{ overview.branch ?? 'HEAD' }}</strong>.
              </p>
              <p v-else-if="modal === 'rename'">
                Altere apenas o nome da branch local.
              </p>
              <p v-else>
                A branch local será removida mesmo que possua commits não integrados.
              </p>
            </div>
            <button
              type="button"
              class="branch-modal-close"
              aria-label="Fechar"
              :disabled="busy"
              @click="closeModal"
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </header>

          <form
            v-if="modal === 'create'"
            class="branch-modal-form"
            @submit.prevent="submitCreate"
          >
            <div class="branch-name-composer">
              <label>
                <span>Prefixo</span>
                <select v-model="branchPrefix" :disabled="busy">
                  <option
                    v-for="prefix in prefixes"
                    :key="prefix.value"
                    :value="prefix.value"
                  >
                    {{ prefix.value }}
                  </option>
                </select>
              </label>
              <label>
                <span>Nome</span>
                <input
                  v-model="branchSuffix"
                  type="text"
                  maxlength="190"
                  placeholder="novo-login"
                  autofocus
                  :disabled="busy"
                />
              </label>
            </div>

            <label>
              <span>Nome completo</span>
              <input
                :value="fullBranchName"
                type="text"
                readonly
                tabindex="-1"
              />
            </label>

            <div class="branch-prefix-grid" aria-label="Tipos de branch">
              <button
                v-for="prefix in prefixes"
                :key="prefix.value"
                type="button"
                :class="{ active: branchPrefix === prefix.value }"
                @click="branchPrefix = prefix.value"
              >
                <strong>{{ prefix.value }}</strong>
                <span>{{ prefix.label }}</span>
              </button>
            </div>

            <footer>
              <button
                type="button"
                class="secondary-button"
                :disabled="busy"
                @click="closeModal"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="primary-button"
                :disabled="busy || !canSubmitCreate"
              >
                Criar e trocar
              </button>
            </footer>
          </form>

          <form
            v-else-if="modal === 'rename'"
            class="branch-modal-form"
            @submit.prevent="submitRename"
          >
            <label>
              <span>Novo nome</span>
              <input
                v-model="renamedBranch"
                type="text"
                maxlength="200"
                autofocus
                :disabled="busy"
              />
            </label>
            <footer>
              <button
                type="button"
                class="secondary-button"
                :disabled="busy"
                @click="closeModal"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="primary-button"
                :disabled="busy || !canSubmitRename"
              >
                Salvar novo nome
              </button>
            </footer>
          </form>

          <form
            v-else
            class="branch-modal-form branch-delete-form"
            @submit.prevent="submitDelete"
          >
            <p>
              Esta ação não pode ser desfeita. Para confirmar, digite
              <strong>{{ selectedRow?.name }}</strong>.
            </p>
            <label>
              <span>Nome da branch</span>
              <input
                v-model="deleteConfirmation"
                type="text"
                autocomplete="off"
                autofocus
                :disabled="busy"
              />
            </label>
            <footer>
              <button
                type="button"
                class="secondary-button"
                :disabled="busy"
                @click="closeModal"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="danger-button"
                :disabled="busy || !canSubmitDelete"
              >
                Remover branch
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./ProjectGitBranchesPage.css"></style>
