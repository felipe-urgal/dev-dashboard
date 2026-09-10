<script setup lang="ts">
import {
  ArrowsPointingInIcon,
  CloudIcon,
  EllipsisHorizontalIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { computed, nextTick, ref } from 'vue';
import { NModal } from 'naive-ui';

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
  remoteRefreshing: boolean;
  squashCommitCount: number;
  forcePushBranch: string | null;
}>();

const emit = defineEmits<{
  create: [name: string];
  switch: [name: string];
  rename: [currentName: string, nextName: string];
  delete: [name: string];
  publish: [name: string];
  squash: [name: string, message: string];
  'force-push': [name: string];
  'refresh-remotes': [];
  track: [remoteBranch: string];
  'delete-remote': [remoteBranch: string];
}>();

type BranchModal =
  'create' | 'rename' | 'squash' | 'delete' | 'delete-remote' | null;
type OpenBranchModal = Exclude<BranchModal, null>;

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

const modal = ref<BranchModal>(null);
const modalDialog = ref<HTMLElement | null>(null);
const selectedBranch = ref('');
const branchPrefix = ref(prefixes[0]!.value);
const branchSuffix = ref('');
const renamedBranch = ref('');
const squashMessage = ref('');
const deleteConfirmation = ref('');
let previousFocus: HTMLElement | null = null;

const actionsBusy = computed(() => props.busy || props.remoteRefreshing);

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

const currentRow = computed(
  () => rows.value.find((row) => row.local?.current) ?? null,
);
const localBranchCount = computed(
  () => rows.value.filter((row) => Boolean(row.local)).length,
);
const originBranchCount = computed(
  () => rows.value.filter((row) => Boolean(row.origin)).length,
);

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

const canSubmitSquash = computed(() => {
  const message = squashMessage.value.trim();
  return Boolean(message) && message.length <= 500;
});

const canSubmitDelete = computed(
  () => deleteConfirmation.value === selectedBranch.value,
);

function isProtected(row: BranchRow): boolean {
  return row.name === 'main' || row.name === 'master';
}

function commitLabel(count: number): string {
  return count === 1 ? 'commit' : 'commits';
}

function stateLabel(row: BranchRow): string {
  if (row.local && row.origin) {
    if (row.local.ahead > 0 && row.local.behind > 0) return 'Divergente';
    if (row.local.behind > 0) {
      return `${row.local.behind} ${commitLabel(row.local.behind)} atrás`;
    }
    if (row.local.ahead > 0) {
      return `${row.local.ahead} ${commitLabel(row.local.ahead)} à frente`;
    }
    return 'Em dia';
  }
  if (row.local) return 'Apenas local';
  return 'Apenas remota';
}

function stateTone(row: BranchRow): string {
  if (row.local && row.origin) {
    if (row.local.behind > 0) return 'warning';
    if (row.local.ahead > 0) return 'ahead';
    return 'synced';
  }
  if (row.local) return 'local';
  return 'remote';
}

function branchTypeLabel(row: BranchRow): string {
  if (row.local && row.origin) return 'Local + Remota';
  if (row.local) return 'Local';
  return 'Remota';
}

function branchTypeTone(row: BranchRow): string {
  if (row.local && row.origin) return 'combined';
  if (row.local) return 'local';
  return 'remote';
}

function rowCommit(row: BranchRow) {
  return row.local?.latestCommit ?? row.origin?.latestCommit;
}

function formatCommitAge(authoredAt: string | undefined): string {
  if (!authoredAt) return 'Data indisponível';
  const timestamp = Date.parse(authoredAt);
  if (!Number.isFinite(timestamp)) return 'Data indisponível';

  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;

  const years = Math.floor(months / 12);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

function hasMenuActions(row: BranchRow): boolean {
  return Boolean(
    (row.local &&
      (props.forcePushBranch === row.name ||
        !row.origin ||
        row.local.ahead > 0)) ||
    (row.local && !isProtected(row)) ||
    (row.origin && !isProtected(row)),
  );
}

const deleteSubmitLabel = computed(() =>
  modal.value === 'delete-remote'
    ? 'Remover do origin'
    : 'Remover branch local',
);

const squashSubmitLabel = computed(() =>
  selectedRow.value?.origin ? 'Fazer squash e reenviar' : 'Fazer squash',
);

const modalTitle = computed(() => {
  switch (modal.value) {
    case 'create':
      return 'Nova branch';
    case 'rename':
      return 'Renomear branch';
    case 'squash':
      return 'Squash de commits';
    case 'delete-remote':
      return 'Remover branch remota';
    default:
      return 'Remover branch local';
  }
});

function focusModalAutofocus(): void {
  void nextTick(() => {
    modalDialog.value
      ?.querySelector<HTMLElement>('[data-branch-modal-autofocus]')
      ?.focus();
  });
}

function openModal(nextModal: OpenBranchModal): void {
  if (typeof document !== 'undefined') {
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }
  modal.value = nextModal;
  focusModalAutofocus();
}

function finishModal(): void {
  modal.value = null;
  const focusTarget = previousFocus;
  previousFocus = null;
  if (!focusTarget) return;
  void nextTick(() => {
    if (focusTarget.isConnected) focusTarget.focus();
  });
}

function handleModalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const dialog = modalDialog.value;
  if (!dialog) return;
  const focusable = [
    ...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
    ),
  ];
  if (focusable.length === 0) return;
  const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && currentIndex <= 0) {
    event.preventDefault();
    focusable.at(-1)?.focus();
  } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
    event.preventDefault();
    focusable[0]?.focus();
  }
}

function updateSquashMessage(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    squashMessage.value = target.value;
  }
}

function openCreateModal(): void {
  selectedBranch.value = '';
  branchPrefix.value = prefixes[0]!.value;
  branchSuffix.value = '';
  openModal('create');
}

function openRenameModal(row: BranchRow): void {
  selectedBranch.value = row.name;
  renamedBranch.value = row.name;
  openModal('rename');
}

function openSquashModal(row: BranchRow): void {
  selectedBranch.value = row.name;
  squashMessage.value = row.local?.latestCommit?.subject?.trim() || row.name;
  openModal('squash');
}

function openDeleteModal(row: BranchRow): void {
  selectedBranch.value = row.name;
  deleteConfirmation.value = '';
  openModal('delete');
}

function openDeleteRemoteModal(row: BranchRow): void {
  selectedBranch.value = row.name;
  deleteConfirmation.value = '';
  openModal('delete-remote');
}

function closeModal(): void {
  if (props.busy) return;
  finishModal();
}

function submitCreate(): void {
  if (!canSubmitCreate.value || actionsBusy.value) return;
  emit('create', fullBranchName.value);
  finishModal();
}

function submitRename(): void {
  if (!canSubmitRename.value || actionsBusy.value) return;
  emit('rename', selectedBranch.value, renamedBranch.value.trim());
  finishModal();
}

function submitSquash(): void {
  if (!canSubmitSquash.value || actionsBusy.value) return;
  emit('squash', selectedBranch.value, squashMessage.value.trim());
  finishModal();
}

function submitDelete(): void {
  if (!canSubmitDelete.value || actionsBusy.value) return;
  if (modal.value === 'delete-remote') {
    const remoteBranch = selectedRow.value?.origin?.name;
    if (!remoteBranch) return;
    emit('delete-remote', remoteBranch);
  } else {
    emit('delete', selectedBranch.value);
  }
  finishModal();
}
</script>

<template src="./ProjectGitBranchesPage.template.html"></template>

<style scoped src="./ProjectGitBranchesPage.css"></style>
