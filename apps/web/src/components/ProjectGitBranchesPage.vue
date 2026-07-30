<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
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
  remoteRefreshing: string;
}>();

const emit = defineEmits<{
  refresh: [];
  create: [name: string];
  switch: [name: string];
  track: [remoteBranch: string];
  fetchRemote: [remote: string];
}>();

type BranchFilter = 'all' | 'local' | 'origin' | 'upstream';

const filter = ref<BranchFilter>('all');
const search = ref('');
const selectedBranchName = ref('');
const createBranchName = ref('');

const MIN_LIST_WIDTH = 30;
const MAX_LIST_WIDTH = 65;
const branchBrowserLayout = ref<HTMLElement | null>(null);
const branchListWidth = ref(45);
const isResizing = ref(false);
const branchLayoutStyle = computed(() => ({
  '--branch-list-width': `${branchListWidth.value}%`,
}));

const branches = computed(() => props.workspace?.branches ?? []);
const localBranches = computed(() => branches.value.filter((branch) => branch.kind === 'local'));
const originBranches = computed(() => branches.value.filter((branch) => branch.remote === 'origin'));
const upstreamBranches = computed(() => branches.value.filter((branch) => branch.remote === 'upstream'));

const filteredBranches = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR');
  return branches.value.filter((branch) => {
    const matchesFilter = filter.value === 'all'
      || filter.value === 'local' && branch.kind === 'local'
      || filter.value === 'origin' && branch.remote === 'origin'
      || filter.value === 'upstream' && branch.remote === 'upstream';
    const matchesSearch = !query
      || branch.name.toLocaleLowerCase('pt-BR').includes(query)
      || branch.latestCommit?.subject.toLocaleLowerCase('pt-BR').includes(query);
    return matchesFilter && matchesSearch;
  });
});

const selectedBranch = computed(() => {
  return branches.value.find((branch) => branch.name === selectedBranchName.value)
    ?? branches.value.find((branch) => branch.current)
    ?? filteredBranches.value[0]
    ?? null;
});

const selectedLocalExists = computed(() => {
  const branch = selectedBranch.value;
  if (!branch || branch.kind !== 'remote') return false;
  return localBranches.value.some((candidate) => candidate.name === branch.shortName);
});

watch(branches, (items) => {
  if (items.length === 0) {
    selectedBranchName.value = '';
    return;
  }
  if (items.some((branch) => branch.name === selectedBranchName.value)) return;
  selectedBranchName.value = items.find((branch) => branch.current)?.name ?? items[0]!.name;
}, { immediate: true });

function formatDate(value: string | undefined): string {
  if (!value) return 'Data não disponível';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function branchSource(branch: GitBranch): string {
  if (branch.kind === 'local') return 'Branch local';
  if (branch.remote === 'origin') return 'Remote de publicação';
  if (branch.remote === 'upstream') return 'Remote principal';
  return `Remote ${branch.remote ?? 'desconhecido'}`;
}

function trackingLabel(branch: GitBranch): string {
  if (branch.kind === 'remote') return branch.name;
  return branch.upstream ?? 'Sem tracking configurado';
}

function stateLabel(branch: GitBranch): string {
  if (branch.current) return 'Atual';
  if (branch.kind === 'remote') return branch.remote ?? 'Remota';
  if (!branch.upstream) return 'Sem tracking';
  if (branch.ahead > 0 && branch.behind > 0) return 'Divergiu';
  if (branch.ahead > 0) return `${branch.ahead} à frente`;
  if (branch.behind > 0) return `${branch.behind} atrás`;
  return 'Sincronizada';
}

function stateTone(branch: GitBranch): string {
  if (branch.current) return 'current';
  if (branch.kind === 'remote') return branch.remote === 'upstream' ? 'upstream' : 'origin';
  if (branch.ahead > 0 && branch.behind > 0) return 'danger';
  if (branch.ahead > 0 || branch.behind > 0 || !branch.upstream) return 'warning';
  return 'success';
}

function submitCreate(): void {
  const name = createBranchName.value.trim();
  if (!name) return;
  emit('create', name);
  createBranchName.value = '';
}

function selectBranch(branch: GitBranch): void {
  selectedBranchName.value = branch.name;
}

function updateBranchListWidth(clientX: number): void {
  const layout = branchBrowserLayout.value;
  if (!layout) return;
  const bounds = layout.getBoundingClientRect();
  if (bounds.width <= 0) return;
  const percentage = ((clientX - bounds.left) / bounds.width) * 100;
  branchListWidth.value = Math.min(
    MAX_LIST_WIDTH,
    Math.max(MIN_LIST_WIDTH, percentage),
  );
}

function stopResizing(): void {
  if (!isResizing.value) return;
  isResizing.value = false;
  document.body.classList.remove('branch-browser-resizing');
  document.removeEventListener('pointermove', resizeWithPointer);
  document.removeEventListener('pointerup', stopResizing);
  document.removeEventListener('pointercancel', stopResizing);
}

function resizeWithPointer(event: PointerEvent): void {
  updateBranchListWidth(event.clientX);
}

function startResizing(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  isResizing.value = true;
  document.body.classList.add('branch-browser-resizing');
  document.addEventListener('pointermove', resizeWithPointer);
  document.addEventListener('pointerup', stopResizing);
  document.addEventListener('pointercancel', stopResizing);
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowLeft'
    ? -5
    : event.key === 'ArrowRight'
      ? 5
      : 0;
  if (!delta) return;
  event.preventDefault();
  branchListWidth.value = Math.min(
    MAX_LIST_WIDTH,
    Math.max(MIN_LIST_WIDTH, branchListWidth.value + delta),
  );
}

onBeforeUnmount(stopResizing);
</script>

<template>
  <section class="git-branches-page">
    <div class="branch-metrics" aria-label="Resumo de branches">
      <article>
        <span>Atual</span>
        <strong>{{ overview.detached ? 'HEAD destacado' : overview.branch ?? 'Sem commits' }}</strong>
        <small>{{ overview.upstream ?? 'Sem tracking' }}</small>
      </article>
      <article>
        <span>Locais</span>
        <strong>{{ localBranches.length }}</strong>
        <small>disponíveis para checkout</small>
      </article>
      <article>
        <span>Origin</span>
        <strong>{{ originBranches.length }}</strong>
        <small>branches publicadas</small>
      </article>
      <article>
        <span>Upstream</span>
        <strong>{{ upstreamBranches.length }}</strong>
        <small>branches da fonte principal</small>
      </article>
    </div>

    <div class="branch-create-card">
      <div>
        <span class="section-kicker">Nova branch</span>
        <h3>Criar a partir do HEAD atual</h3>
        <p>A árvore de trabalho deve estar limpa para trocar de contexto com segurança.</p>
      </div>
      <form @submit.prevent="submitCreate">
        <label>
          <span>Nome da branch</span>
          <input
            v-model="createBranchName"
            type="text"
            maxlength="200"
            placeholder="feature/nova-funcionalidade"
            :disabled="busy"
          />
        </label>
        <button
          type="submit"
          class="primary-button"
          :disabled="busy || !createBranchName.trim()"
        >
          Criar e trocar
        </button>
      </form>
    </div>

    <div class="branch-browser-card">
      <div class="branch-browser-toolbar">
        <div class="branch-filter-tabs" aria-label="Filtrar branches">
          <button type="button" :class="{ active: filter === 'all' }" @click="filter = 'all'">Todas</button>
          <button type="button" :class="{ active: filter === 'local' }" @click="filter = 'local'">Locais</button>
          <button type="button" :class="{ active: filter === 'origin' }" @click="filter = 'origin'">Origin</button>
          <button type="button" :class="{ active: filter === 'upstream' }" @click="filter = 'upstream'">Upstream</button>
        </div>
        <label class="branch-search">
          <span class="sr-only">Buscar branch</span>
          <input v-model="search" type="search" placeholder="Buscar branch ou commit…" />
        </label>
        <span class="branch-result-count">{{ filteredBranches.length }} resultado(s)</span>
        <button
          type="button"
          class="secondary-button branch-refresh-button"
          :disabled="loading"
          @click="emit('refresh')"
        >
          {{ loading ? 'Atualizando…' : 'Atualizar lista' }}
        </button>
      </div>

      <div
        ref="branchBrowserLayout"
        class="branch-browser-layout"
        :class="{ resizing: isResizing }"
        :style="branchLayoutStyle"
      >
        <aside class="branch-list" aria-label="Lista de branches">
          <button
            v-for="branch in filteredBranches"
            :key="`${branch.kind}-${branch.name}`"
            type="button"
            class="git-table-row branches-table branch-list-item"
            :class="{ selected: selectedBranch?.name === branch.name }"
            @click="selectBranch(branch)"
          >
            <span class="branch-kind-icon" :class="`branch-kind-${branch.kind}`" aria-hidden="true">
              {{ branch.kind === 'local' ? '⑂' : '◌' }}
            </span>
            <span class="branch-list-copy">
              <strong>{{ branch.name }}</strong>
              <small>{{ branch.latestCommit?.subject || trackingLabel(branch) }}</small>
            </span>
            <span class="branch-state" :class="`branch-state-${stateTone(branch)}`">
              {{ stateLabel(branch) }}
            </span>
          </button>
          <div v-if="filteredBranches.length === 0" class="branch-empty-state">
            Nenhuma branch corresponde aos filtros atuais.
          </div>
        </aside>

        <div
          class="branch-resize-handle"
          role="separator"
          aria-label="Redimensionar lista e detalhes das branches"
          aria-orientation="vertical"
          :aria-valuemin="MIN_LIST_WIDTH"
          :aria-valuemax="MAX_LIST_WIDTH"
          :aria-valuenow="Math.round(branchListWidth)"
          tabindex="0"
          @pointerdown="startResizing"
          @keydown="resizeWithKeyboard"
        >
          <span aria-hidden="true" />
        </div>

        <article v-if="selectedBranch" class="branch-detail-panel">
          <header>
            <div>
              <span class="section-kicker">{{ branchSource(selectedBranch) }}</span>
              <h3>{{ selectedBranch.name }}</h3>
            </div>
            <span class="branch-state" :class="`branch-state-${stateTone(selectedBranch)}`">
              {{ stateLabel(selectedBranch) }}
            </span>
          </header>

          <dl class="branch-detail-grid">
            <div>
              <dt>Tipo</dt>
              <dd>{{ selectedBranch.kind === 'local' ? 'Local' : 'Remota' }}</dd>
            </div>
            <div>
              <dt>Tracking</dt>
              <dd><code>{{ trackingLabel(selectedBranch) }}</code></dd>
            </div>
            <div>
              <dt>À frente</dt>
              <dd>{{ selectedBranch.ahead }}</dd>
            </div>
            <div>
              <dt>Atrás</dt>
              <dd>{{ selectedBranch.behind }}</dd>
            </div>
          </dl>

          <section class="branch-commit-detail">
            <span class="section-kicker">Último commit</span>
            <template v-if="selectedBranch.latestCommit">
              <div class="branch-commit-heading">
                <code>{{ selectedBranch.latestCommit.shortHash }}</code>
                <strong>{{ selectedBranch.latestCommit.subject }}</strong>
              </div>
              <p>
                {{ selectedBranch.latestCommit.authorName }} ·
                {{ formatDate(selectedBranch.latestCommit.authoredAt) }}
              </p>
            </template>
            <p v-else>Nenhum commit disponível para esta referência.</p>
          </section>

          <div v-if="selectedBranch.kind === 'local'" class="branch-detail-actions">
            <button
              type="button"
              class="primary-button"
              :disabled="busy || selectedBranch.current"
              @click="emit('switch', selectedBranch.name)"
            >
              {{ selectedBranch.current ? 'Branch atual' : 'Trocar para esta branch' }}
            </button>
          </div>

          <div v-else class="branch-detail-actions remote-actions">
            <button
              type="button"
              class="secondary-button"
              :disabled="remoteRefreshing === selectedBranch.remote || !selectedBranch.remote"
              @click="selectedBranch.remote && emit('fetchRemote', selectedBranch.remote)"
            >
              {{ remoteRefreshing === selectedBranch.remote ? 'Atualizando…' : `Fetch ${selectedBranch.remote}` }}
            </button>
            <button
              type="button"
              class="primary-button"
              :disabled="busy || selectedLocalExists"
              @click="emit('track', selectedBranch.name)"
            >
              {{ selectedLocalExists ? 'Branch local já existe' : 'Criar local e trocar' }}
            </button>
          </div>

          <p v-if="selectedBranch.kind === 'remote'" class="branch-action-hint">
            A branch local será criada como <code>{{ selectedBranch.shortName }}</code> e ficará rastreando <code>{{ selectedBranch.name }}</code>.
          </p>
        </article>

        <div v-else class="branch-detail-panel branch-empty-state">
          Selecione uma branch para ver os detalhes.
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.git-branches-page {
  display: grid;
  gap: 18px;
}

.branch-create-card,
.branch-browser-toolbar,
.branch-detail-panel header,
.branch-detail-actions,
.branch-commit-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.branch-create-card h3,
.branch-detail-panel h3 {
  margin: 3px 0 0;
  color: var(--color-text-strong, #182033);
}

.branch-create-card p,
.branch-commit-detail p,
.branch-action-hint {
  margin: 6px 0 0;
  color: var(--color-text-muted, #667085);
}

.section-kicker {
  color: var(--color-text-muted, #667085);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.branch-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.branch-metrics article,
.branch-create-card,
.branch-browser-card {
  border: 1px solid var(--color-border, #d8deea);
  border-radius: 14px;
  background: var(--color-surface, #fff);
  box-shadow: 0 10px 28px rgba(29, 43, 76, 0.04);
}

.branch-metrics article {
  display: grid;
  gap: 5px;
  padding: 16px;
}

.branch-metrics span,
.branch-metrics small {
  color: var(--color-text-muted, #667085);
}

.branch-metrics strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-strong, #182033);
  font-size: 1.05rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-create-card {
  padding: 18px;
}

.branch-create-card form {
  display: grid;
  grid-template-columns: minmax(260px, 420px) auto;
  align-items: end;
  gap: 10px;
}

.branch-create-card label,
.branch-search {
  display: grid;
  gap: 6px;
}

.branch-create-card label span {
  color: var(--color-text-muted, #667085);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}

input {
  min-height: 40px;
  border: 1px solid var(--color-border, #d8deea);
  border-radius: 9px;
  background: var(--color-input, #f7f9fc);
  color: var(--color-text-strong, #182033);
  padding: 0 12px;
}

.branch-browser-card {
  overflow: hidden;
}

.branch-browser-toolbar {
  padding: 14px;
  border-bottom: 1px solid var(--color-border, #d8deea);
  background: var(--color-surface-subtle, #fbfcfe);
}

.branch-filter-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border, #d8deea);
  border-radius: 10px;
  background: var(--color-surface, #fff);
}

.branch-filter-tabs button {
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-muted, #667085);
  padding: 7px 11px;
  font-weight: 700;
}

.branch-filter-tabs button.active {
  background: rgba(49, 75, 196, 0.11);
  color: #314bc4;
}

.branch-search {
  flex: 1;
  max-width: 440px;
}

.branch-result-count {
  color: var(--color-text-muted, #667085);
  font-size: 0.82rem;
  white-space: nowrap;
}

.branch-browser-layout {
  display: grid;
  grid-template-columns:
    minmax(300px, var(--branch-list-width))
    10px
    minmax(360px, 1fr);
  min-height: 460px;
}

.branch-resize-handle {
  position: relative;
  display: grid;
  place-items: center;
  width: 10px;
  cursor: col-resize;
  touch-action: none;
}

.branch-resize-handle::before {
  position: absolute;
  inset: 0;
  background: var(--color-border, #d8deea);
  content: '';
  opacity: 0;
  transition: opacity 120ms ease;
}

.branch-resize-handle span {
  position: relative;
  width: 3px;
  height: 42px;
  border-radius: 999px;
  background: var(--color-border, #d8deea);
  transition:
    background 120ms ease,
    height 120ms ease;
}

.branch-resize-handle:hover::before,
.branch-resize-handle:focus-visible::before,
.branch-browser-layout.resizing .branch-resize-handle::before {
  opacity: 0.2;
}

.branch-resize-handle:hover span,
.branch-resize-handle:focus-visible span,
.branch-browser-layout.resizing .branch-resize-handle span {
  height: 58px;
  background: #314bc4;
}

.branch-resize-handle:focus-visible {
  outline: 2px solid #314bc4;
  outline-offset: -2px;
}

:global(body.branch-browser-resizing) {
  cursor: col-resize;
  user-select: none;
}

.branch-list {
  overflow: auto;
  max-height: 560px;
  padding: 10px;
}

.branch-list-item {
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  padding: 11px;
  text-align: left;
}

.branch-list-item:hover,
.branch-list-item.selected {
  border-color: rgba(49, 75, 196, 0.28);
  background: rgba(49, 75, 196, 0.06);
}

.branch-kind-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: rgba(49, 75, 196, 0.1);
  color: #314bc4;
  font-weight: 800;
}

.branch-kind-remote {
  background: rgba(12, 148, 105, 0.1);
  color: #087552;
}

.branch-list-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.branch-list-copy strong,
.branch-list-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-list-copy strong {
  color: var(--color-text-strong, #182033);
}

.branch-list-copy small {
  color: var(--color-text-muted, #667085);
}

.branch-state {
  border-radius: 999px;
  padding: 5px 8px;
  font-size: 0.7rem;
  font-weight: 800;
  white-space: nowrap;
}

.branch-state-current {
  background: rgba(49, 75, 196, 0.12);
  color: #314bc4;
}

.branch-state-success {
  background: rgba(12, 148, 105, 0.12);
  color: #087552;
}

.branch-state-warning {
  background: rgba(209, 132, 18, 0.14);
  color: #9b5e00;
}

.branch-state-danger {
  background: rgba(196, 49, 70, 0.12);
  color: #a42036;
}

.branch-state-origin {
  background: rgba(49, 75, 196, 0.1);
  color: #314bc4;
}

.branch-state-upstream {
  background: rgba(120, 72, 190, 0.12);
  color: #6840a6;
}

.branch-detail-panel {
  display: grid;
  align-content: start;
  gap: 20px;
  padding: 22px;
}

.branch-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.branch-detail-grid div {
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid var(--color-border, #d8deea);
  border-radius: 10px;
  background: var(--color-surface-subtle, #fbfcfe);
}

.branch-detail-grid dt {
  color: var(--color-text-muted, #667085);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.branch-detail-grid dd {
  min-width: 0;
  margin: 0;
  color: var(--color-text-strong, #182033);
  font-weight: 700;
}

.branch-detail-grid code {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-commit-detail {
  display: grid;
  gap: 9px;
  border-top: 1px solid var(--color-border, #d8deea);
  border-bottom: 1px solid var(--color-border, #d8deea);
  padding: 18px 0;
}

.branch-commit-heading {
  justify-content: flex-start;
}

.branch-commit-heading code {
  border-radius: 6px;
  background: rgba(49, 75, 196, 0.1);
  color: #314bc4;
  padding: 4px 7px;
}

.branch-detail-actions {
  justify-content: flex-start;
}

.branch-action-hint {
  font-size: 0.82rem;
}

.branch-empty-state {
  display: grid;
  place-items: center;
  min-height: 160px;
  color: var(--color-text-muted, #667085);
  padding: 24px;
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (max-width: 1050px) {
  .branch-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .branch-create-card,
  .branch-browser-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .branch-create-card form {
    grid-template-columns: 1fr auto;
  }

  .branch-search {
    max-width: none;
  }

  .branch-browser-layout {
    grid-template-columns: 1fr;
  }

  .branch-resize-handle {
    display: none;
  }

  .branch-list {
    max-height: 360px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border, #d8deea);
  }
}

@media (max-width: 680px) {
  .branch-create-card,
  .branch-browser-toolbar,
  .branch-detail-panel header,
  .branch-detail-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .branch-metrics,
  .branch-detail-grid,
  .branch-create-card form {
    grid-template-columns: 1fr;
  }

  .branch-filter-tabs {
    overflow-x: auto;
  }

  .branch-list-item {
    grid-template-columns: 30px minmax(0, 1fr);
  }

  .branch-list-item .branch-state {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
