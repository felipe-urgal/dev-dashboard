<script setup lang="ts">
import { computed, ref } from 'vue';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  buildBranchRows,
  countBranches,
  filterBranchRows,
  groupBranchRows,
  isProtectedBranch,
  type BranchFilter,
  type BranchMenuAction,
  type BranchRow,
} from '../utils/git-branches';
import GitBranchDialogs, {
  type BranchDialog,
} from './git-branches/GitBranchDialogs.vue';
import GitBranchRow from './git-branches/GitBranchRow.vue';
import GitBranchToolbar from './git-branches/GitBranchToolbar.vue';

const props = defineProps<{
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  loading: boolean;
  busy: boolean;
  remoteRefreshing: boolean;
  operation?: {
    kind:
      | 'create'
      | 'switch'
      | 'rename'
      | 'delete'
      | 'publish'
      | 'track'
      | 'delete-remote';
    branch: string;
  } | null;
}>();

const emit = defineEmits<{
  create: [name: string];
  switch: [name: string];
  rename: [currentName: string, nextName: string];
  delete: [name: string];
  publish: [name: string];
  track: [remoteBranch: string];
  'delete-remote': [remoteBranch: string];
  'open-pull-request': [];
}>();

/** A seção "Somente no origin" encolhe quando passa disso. */
const REMOTE_COLLAPSE_AFTER = 6;
const REMOTE_COLLAPSED_SIZE = 3;

const query = ref('');
const filter = ref<BranchFilter>('all');
const remoteExpanded = ref(false);

const dialog = ref<BranchDialog | null>(null);
const dialogRow = ref<BranchRow | null>(null);

const actionsBusy = computed(() => props.busy || props.remoteRefreshing);

const allRows = computed(() => buildBranchRows(props.workspace));
const counts = computed(() => countBranches(allRows.value));
const visible = computed(() =>
  groupBranchRows(
    filterBranchRows(allRows.value, {
      query: query.value,
      filter: filter.value,
    }),
  ),
);

const searching = computed(
  () => query.value.trim() !== '' || filter.value === 'remote',
);
const remoteCollapsible = computed(
  () =>
    !searching.value && visible.value.remoteOnly.length > REMOTE_COLLAPSE_AFTER,
);
const remoteRows = computed(() =>
  remoteCollapsible.value && !remoteExpanded.value
    ? visible.value.remoteOnly.slice(0, REMOTE_COLLAPSED_SIZE)
    : visible.value.remoteOnly,
);

const noResults = computed(
  () =>
    !props.loading &&
    visible.value.current.length +
      visible.value.local.length +
      visible.value.remoteOnly.length ===
      0,
);

const currentBranchName = computed(
  () => props.overview.branch ?? 'a branch atual',
);

function operationKindFor(row: BranchRow): string | undefined {
  return props.operation?.branch === row.name
    ? props.operation.kind
    : undefined;
}

function protectedRow(row: BranchRow): boolean {
  return isProtectedBranch(row, props.workspace);
}

function openCreate(): void {
  dialogRow.value = null;
  dialog.value = 'create';
}

function handleMenu(row: BranchRow, action: BranchMenuAction): void {
  dialogRow.value = row;
  dialog.value = action;
}

function closeDialog(): void {
  if (props.busy) return;
  dialog.value = null;
}

function finish(): void {
  dialog.value = null;
}

function submitRename(nextName: string): void {
  if (dialogRow.value) emit('rename', dialogRow.value.name, nextName);
  finish();
}

function submitRemove(): void {
  const row = dialogRow.value;
  if (!row) return;

  if (dialog.value === 'delete-remote') {
    if (row.origin) emit('delete-remote', row.origin.name);
  } else {
    emit('delete', row.name);
  }
  finish();
}
</script>

<template>
  <section class="git-branches-page">
    <GitBranchToolbar
      v-model:query="query"
      v-model:filter="filter"
      :local-count="counts.local"
      :remote-only-count="counts.remoteOnly"
      :disabled="actionsBusy"
      :creating="operation?.kind === 'create'"
      @create="openCreate"
    />

    <p v-if="loading" class="git-branches-note">Atualizando branches…</p>
    <p v-else-if="allRows.length === 0" class="git-branches-note">
      Nenhuma branch disponível.
    </p>
    <p v-else-if="noResults" class="git-branches-note">
      Nenhuma branch encontrada.
    </p>

    <section
      v-if="visible.current.length > 0"
      class="git-branches-section"
      aria-label="Branch atual"
    >
      <header>Branch atual</header>
      <GitBranchRow
        v-for="row in visible.current"
        :key="row.name"
        :row="row"
        :is-protected="protectedRow(row)"
        :operation-kind="operationKindFor(row)"
        :disabled="actionsBusy"
        @open-pull-request="emit('open-pull-request')"
        @menu-select="(action) => handleMenu(row, action)"
      />
    </section>

    <section
      v-if="visible.local.length > 0"
      class="git-branches-section"
      aria-label="Locais"
    >
      <header>
        Locais <span>{{ visible.local.length }}</span>
      </header>
      <GitBranchRow
        v-for="row in visible.local"
        :key="row.name"
        :row="row"
        :is-protected="protectedRow(row)"
        :operation-kind="operationKindFor(row)"
        :disabled="actionsBusy"
        @switch="emit('switch', row.name)"
        @publish="emit('publish', row.name)"
        @menu-select="(action) => handleMenu(row, action)"
      />
    </section>

    <section
      v-if="visible.remoteOnly.length > 0"
      class="git-branches-section"
      aria-label="Somente no origin"
    >
      <header>
        Somente no origin <span>{{ visible.remoteOnly.length }}</span>
        <button
          v-if="remoteCollapsible"
          type="button"
          class="git-branches-toggle"
          @click="remoteExpanded = !remoteExpanded"
        >
          {{
            remoteExpanded
              ? 'Mostrar menos'
              : `Ver todas (${visible.remoteOnly.length})`
          }}
        </button>
      </header>
      <GitBranchRow
        v-for="row in remoteRows"
        :key="row.name"
        :row="row"
        :is-protected="protectedRow(row)"
        :operation-kind="operationKindFor(row)"
        :disabled="actionsBusy"
        @track="row.origin && emit('track', row.origin.name)"
        @menu-select="(action) => handleMenu(row, action)"
      />
    </section>

    <GitBranchDialogs
      :dialog="dialog"
      :target="dialogRow?.name ?? ''"
      :remote-target="dialogRow?.origin?.shortName ?? dialogRow?.name ?? ''"
      :current-branch="currentBranchName"
      :busy="actionsBusy"
      @close="closeDialog"
      @create="(name) => (emit('create', name), finish())"
      @rename="submitRename"
      @remove="submitRemove"
    />
  </section>
</template>

<style scoped>
.git-branches-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.git-branches-note {
  margin: 0;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  background: var(--surface-1);
  text-align: center;
}

.git-branches-section {
  /* Recorta o destaque da linha atual nos cantos arredondados. */
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-branches-section > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 650;
}

.git-branches-section > header span {
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 500;
}

.git-branches-toggle {
  margin-left: auto;
  padding: 0;
  border: 0;
  color: var(--text-dim);
  background: transparent;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  text-decoration: underline;
  cursor: pointer;
}
</style>
