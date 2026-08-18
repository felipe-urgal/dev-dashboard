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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { NModal, NPopover } from 'naive-ui';

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
  publish: [name: string];
  'refresh-remotes': [];
  track: [remoteBranch: string];
  'delete-remote': [remoteBranch: string];
}>();

type BranchModal = 'create' | 'rename' | 'delete' | 'delete-remote' | null;

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

const fullBranchName = computed(() => {
  const suffix = branchSuffix.value.trim().replace(/^\/+/, '');
  return suffix ? `${branchPrefix.value}${suffix}` : branchPrefix.value;
});

const selectedRow = computed(() =>
  rows.value.find((row) => row.name === selectedBranch.value),
);

const canSubmitCreate = computed(() => {
  const suffix = branchSuffix.value.trim().replace(/^\/+/, '');
  return Boolean(suffix) && fullBranchName.value.length <= 200;
});

const canSubmitRename = computed(() => {
  const nextName = renamedBranch.value.trim();
  return (
    Boolean(nextName) &&
    nextName !== selectedBranch.value &&
    nextName.length <= 200
  );
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

const deleteSubmitLabel = computed(() =>
  modal.value === 'delete-remote'
    ? 'Remover do origin'
    : 'Remover branch local',
);

const modalTitle = computed(() => {
  switch (modal.value) {
    case 'create':
      return 'Nova branch';
    case 'rename':
      return 'Renomear branch';
    case 'delete-remote':
      return 'Remover branch remota';
    default:
      return 'Remover branch local';
  }
});

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

function openDeleteRemoteModal(row: BranchRow): void {
  closeMenu();
  selectedBranch.value = row.name;
  deleteConfirmation.value = '';
  modal.value = 'delete-remote';
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
  if (modal.value === 'delete-remote') {
    const remoteBranch = selectedRow.value?.origin?.name;
    if (!remoteBranch) return;
    emit('delete-remote', remoteBranch);
  } else {
    emit('delete', selectedBranch.value);
  }
  modal.value = null;
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || modal.value) return;
  closeMenu();
}

onMounted(() => {
  document.addEventListener('keydown', handleEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template src="./ProjectGitBranchesPage.template.html"></template>

<style scoped src="./ProjectGitBranchesPage.css"></style>

<style>
/* NPopover teleporta o conteúdo pra fora da árvore do componente, então o
   estilo do box em si (a classe passada via prop) não pode ser escopado. */
.branch-menu-popover {
  display: grid;
  min-width: 190px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  
}
</style>
