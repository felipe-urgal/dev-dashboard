<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import type {
  GitDiffFile,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileDiff,
  GitFileStatus,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectGit,
  fetchProjectGitDiff,
  fetchProjectGitFileDiff,
} from '../api';
import {
  buildSplitGitDiffRows,
  countGitDiffMatches,
  highlightGitDiffText,
  parseUnifiedGitDiff,
} from '../utils/git-diff-view';
import { gitFileToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  projectId: string;
}>();

type DiffViewMode = 'unified' | 'split';
type DiffStatusFilter = 'all' | GitFileStatus;

const scope = ref<GitDiffScope>('combined');
const snapshot = ref<GitDiffSnapshot | null>(null);
const overview = ref<ProjectGitOverview | null>(null);
const selectedPath = ref('');
const fileDiff = ref<GitFileDiff | null>(null);
const fileSearch = ref('');
const diffSearch = ref('');
const statusFilter = ref<DiffStatusFilter>('all');
const viewMode = ref<DiffViewMode>('unified');
const loadingSnapshot = ref(false);
const loadingFile = ref(false);
const snapshotError = ref('');
const fileError = ref('');
const copied = ref(false);
let snapshotController: AbortController | undefined;
let fileController: AbortController | undefined;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const scopeOptions: Array<{
  value: GitDiffScope;
  label: string;
  description: string;
}> = [
  {
    value: 'combined',
    label: 'Todas',
    description: 'Staged e não staged',
  },
  {
    value: 'index',
    label: 'Staged',
    description: 'Prontas para commit',
  },
  {
    value: 'worktree',
    label: 'Não staged',
    description: 'Fora do índice',
  },
];

const statusLabels: Record<GitFileStatus, string> = {
  added: 'Adicionado',
  modified: 'Modificado',
  deleted: 'Removido',
  renamed: 'Renomeado',
  copied: 'Copiado',
  untracked: 'Não rastreado',
  conflicted: 'Conflito',
  'type-changed': 'Tipo alterado',
};

const statusOptions: Array<{
  value: DiffStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'modified', label: 'Modificados' },
  { value: 'added', label: 'Adicionados' },
  { value: 'deleted', label: 'Removidos' },
  { value: 'renamed', label: 'Renomeados' },
  { value: 'untracked', label: 'Não rastreados' },
  { value: 'conflicted', label: 'Com conflito' },
];

const currentScope = computed(() =>
  scopeOptions.find((option) => option.value === scope.value) ?? scopeOptions[0]!,
);

const branchLabel = computed(() => {
  if (!overview.value) return 'Carregando branch…';
  if (overview.value.detached) return 'HEAD destacado';
  return overview.value.branch ?? 'Repositório sem commits';
});

const filteredFiles = computed(() => {
  const query = fileSearch.value.trim().toLocaleLowerCase('pt-BR');
  return (snapshot.value?.files ?? []).filter((file) => {
    if (statusFilter.value !== 'all' && file.status !== statusFilter.value) {
      return false;
    }
    if (!query) return true;
    return [file.path, file.previousPath ?? '', statusLabels[file.status]]
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
  });
});

const selectedFile = computed(() =>
  snapshot.value?.files.find((file) => file.path === selectedPath.value),
);

const totalAdditions = computed(() =>
  (snapshot.value?.files ?? []).reduce((total, file) => total + file.additions, 0),
);

const totalDeletions = computed(() =>
  (snapshot.value?.files ?? []).reduce((total, file) => total + file.deletions, 0),
);

const binaryCount = computed(() =>
  (snapshot.value?.files ?? []).filter((file) => file.binary).length,
);

const unifiedLines = computed(() =>
  parseUnifiedGitDiff(fileDiff.value?.content ?? ''),
);

const splitRows = computed(() =>
  buildSplitGitDiffRows(unifiedLines.value),
);

const diffMatchCount = computed(() =>
  countGitDiffMatches(fileDiff.value?.content ?? '', diffSearch.value),
);

function fileName(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}

function directoryName(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'raiz do projeto';
}

function linePrefix(kind: string): string {
  if (kind === 'addition') return '+';
  if (kind === 'deletion') return '−';
  if (kind === 'context') return ' ';
  return '';
}

function highlighted(text: string): string {
  return highlightGitDiffText(text, diffSearch.value);
}

async function loadOverview(): Promise<void> {
  try {
    overview.value = await fetchProjectGit(props.projectId);
  } catch {
    overview.value = null;
  }
}

async function selectFile(filePath: string): Promise<void> {
  if (!filePath) {
    selectedPath.value = '';
    fileDiff.value = null;
    return;
  }

  fileController?.abort();
  const controller = new AbortController();
  fileController = controller;
  selectedPath.value = filePath;
  fileDiff.value = null;
  fileError.value = '';
  loadingFile.value = true;

  try {
    const result = await fetchProjectGitFileDiff(
      props.projectId,
      filePath,
      scope.value,
      controller.signal,
    );
    if (!controller.signal.aborted && selectedPath.value === filePath) {
      fileDiff.value = result;
    }
  } catch (error) {
    if (!controller.signal.aborted && selectedPath.value === filePath) {
      fileError.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar o diff deste arquivo.';
    }
  } finally {
    if (!controller.signal.aborted && selectedPath.value === filePath) {
      loadingFile.value = false;
    }
  }
}

async function loadSnapshot(): Promise<void> {
  snapshotController?.abort();
  fileController?.abort();
  const controller = new AbortController();
  snapshotController = controller;
  loadingSnapshot.value = true;
  snapshotError.value = '';
  fileError.value = '';
  fileDiff.value = null;

  try {
    const result = await fetchProjectGitDiff(
      props.projectId,
      scope.value,
      controller.signal,
    );
    if (controller.signal.aborted) return;

    snapshot.value = result;
    const preserved = result.files.find((file) => file.path === selectedPath.value);
    const target = preserved?.path ?? result.files[0]?.path ?? '';
    selectedPath.value = target;
    if (target) await selectFile(target);
  } catch (error) {
    if (!controller.signal.aborted) {
      snapshot.value = null;
      selectedPath.value = '';
      snapshotError.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar as alterações do projeto.';
    }
  } finally {
    if (!controller.signal.aborted) loadingSnapshot.value = false;
  }
}

async function refresh(): Promise<void> {
  await Promise.all([loadOverview(), loadSnapshot()]);
}

async function copySelectedPath(): Promise<void> {
  if (!selectedPath.value) return;
  try {
    await navigator.clipboard.writeText(selectedPath.value);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 1_800);
  } catch {
    copied.value = false;
  }
}

async function moveSelection(direction: -1 | 1): Promise<void> {
  const files = filteredFiles.value;
  if (files.length === 0) return;
  const currentIndex = files.findIndex((file) => file.path === selectedPath.value);
  const nextIndex = currentIndex < 0
    ? 0
    : Math.min(files.length - 1, Math.max(0, currentIndex + direction));
  const target = files[nextIndex];
  if (!target || target.path === selectedPath.value) return;
  await selectFile(target.path);
  await nextTick();
  document.querySelector<HTMLButtonElement>(
    `[data-git-diff-path="${CSS.escape(target.path)}"]`,
  )?.focus();
}

function handleFileListKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    void moveSelection(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    void moveSelection(-1);
  }
}

watch(
  [() => props.projectId, scope],
  () => {
    selectedPath.value = '';
    fileDiff.value = null;
    diffSearch.value = '';
    void refresh();
  },
  { immediate: true },
);

watch(filteredFiles, (files) => {
  if (files.some((file) => file.path === selectedPath.value)) return;
  const first = files[0];
  if (first) void selectFile(first.path);
  else {
    selectedPath.value = '';
    fileDiff.value = null;
  }
});

onBeforeUnmount(() => {
  snapshotController?.abort();
  fileController?.abort();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <section class="git-diff-page">
    <header class="git-diff-page-heading">
      <div>
        <span class="git-diff-kicker">Revisão de código</span>
        <h2>Alterações da branch</h2>
        <p>
          <strong>{{ branchLabel }}</strong>
          <span aria-hidden="true">·</span>
          {{ currentScope.description }}
        </p>
      </div>

      <div class="git-diff-heading-actions">
        <div class="git-diff-scope-switch" aria-label="Escopo do diff">
          <button
            v-for="option in scopeOptions"
            :key="option.value"
            type="button"
            :class="{ active: scope === option.value }"
            :aria-pressed="scope === option.value"
            @click="scope = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <button
          class="git-diff-refresh-button"
          type="button"
          :disabled="loadingSnapshot"
          @click="refresh"
        >
          <ArrowPathIcon :class="{ spinning: loadingSnapshot }" aria-hidden="true" />
          {{ loadingSnapshot ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <div v-if="snapshotError" class="project-error" role="alert">
      {{ snapshotError }}
    </div>

    <div class="git-diff-metrics" aria-label="Resumo das alterações">
      <article>
        <span>Arquivos</span>
        <strong>{{ snapshot?.files.length ?? 0 }}</strong>
        <small>{{ filteredFiles.length }} visível(is)</small>
      </article>
      <article class="is-addition">
        <span>Adições</span>
        <strong>+{{ totalAdditions }}</strong>
        <small>linhas adicionadas</small>
      </article>
      <article class="is-deletion">
        <span>Remoções</span>
        <strong>−{{ totalDeletions }}</strong>
        <small>linhas removidas</small>
      </article>
      <article>
        <span>Binários</span>
        <strong>{{ binaryCount }}</strong>
        <small>sem visualização inline</small>
      </article>
    </div>

    <div class="git-diff-toolbar">
      <label class="git-diff-file-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          v-model="fileSearch"
          type="search"
          placeholder="Buscar arquivo ou caminho…"
          aria-label="Buscar arquivos alterados"
        />
      </label>

      <label class="git-diff-status-filter">
        <FunnelIcon aria-hidden="true" />
        <select v-model="statusFilter" aria-label="Filtrar arquivos por status">
          <option
            v-for="option in statusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="loadingSnapshot && !snapshot" class="git-diff-empty">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      <strong>Carregando alterações</strong>
      <span>Consultando arquivos staged e o working tree.</span>
    </div>

    <div v-else-if="snapshot && snapshot.files.length === 0" class="git-diff-empty">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhuma alteração neste escopo</strong>
      <span>{{ currentScope.description }} não possui arquivos para revisar.</span>
    </div>

    <div v-else-if="snapshot" class="git-diff-workspace">
      <aside class="git-diff-files-pane">
        <header>
          <div>
            <h3>Arquivos alterados</h3>
            <span>{{ filteredFiles.length }} de {{ snapshot.files.length }}</span>
          </div>
          <small>↑ ↓ para navegar</small>
        </header>

        <div
          class="git-diff-file-list"
          role="listbox"
          aria-label="Arquivos alterados"
          @keydown="handleFileListKeydown"
        >
          <button
            v-for="file in filteredFiles"
            :key="`${file.path}-${file.previousPath ?? ''}`"
            type="button"
            role="option"
            :data-git-diff-path="file.path"
            :aria-selected="selectedPath === file.path"
            :class="{ active: selectedPath === file.path }"
            @click="selectFile(file.path)"
          >
            <StatusBadge :tone="gitFileToneFor(file.status)">
              {{ statusLabels[file.status] }}
            </StatusBadge>

            <span class="git-diff-file-copy">
              <strong>{{ fileName(file.path) }}</strong>
              <small v-if="file.previousPath">
                {{ file.previousPath }} → {{ file.path }}
              </small>
              <small v-else>{{ directoryName(file.path) }}</small>
            </span>

            <span class="git-diff-file-stats">
              <template v-if="file.binary">binário</template>
              <template v-else>
                <b>+{{ file.additions }}</b>
                <i>−{{ file.deletions }}</i>
              </template>
            </span>
          </button>

          <div v-if="filteredFiles.length === 0" class="git-diff-list-empty">
            Nenhum arquivo corresponde aos filtros.
          </div>
        </div>
      </aside>

      <main class="git-diff-viewer">
        <template v-if="selectedFile">
          <header class="git-diff-file-header">
            <div class="git-diff-selected-file">
              <StatusBadge :tone="gitFileToneFor(selectedFile.status)">
                {{ statusLabels[selectedFile.status] }}
              </StatusBadge>
              <div>
                <h3>{{ selectedFile.path }}</h3>
                <p v-if="selectedFile.previousPath">
                  Renomeado de {{ selectedFile.previousPath }}
                </p>
                <p v-else>
                  {{ selectedFile.binary ? 'Arquivo binário' : `+${selectedFile.additions} / −${selectedFile.deletions} linhas` }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="git-diff-copy-button"
              :title="copied ? 'Caminho copiado' : 'Copiar caminho do arquivo'"
              @click="copySelectedPath"
            >
              <ClipboardDocumentIcon aria-hidden="true" />
              {{ copied ? 'Copiado' : 'Copiar caminho' }}
            </button>
          </header>

          <div class="git-diff-viewer-toolbar">
            <div class="git-diff-view-switch" aria-label="Modo de visualização">
              <button
                type="button"
                :class="{ active: viewMode === 'unified' }"
                :aria-pressed="viewMode === 'unified'"
                @click="viewMode = 'unified'"
              >
                <Bars3BottomLeftIcon aria-hidden="true" />
                Unificado
              </button>
              <button
                type="button"
                :class="{ active: viewMode === 'split' }"
                :aria-pressed="viewMode === 'split'"
                @click="viewMode = 'split'"
              >
                <ViewColumnsIcon aria-hidden="true" />
                Lado a lado
              </button>
            </div>

            <label class="git-diff-content-search">
              <MagnifyingGlassIcon aria-hidden="true" />
              <input
                v-model="diffSearch"
                type="search"
                placeholder="Buscar neste diff…"
                aria-label="Buscar dentro do diff"
              />
              <span v-if="diffSearch.trim()">
                {{ diffMatchCount }} ocorrência(s)
              </span>
            </label>
          </div>

          <p v-if="fileError" class="project-error git-diff-file-error" role="alert">
            {{ fileError }}
          </p>

          <div v-else-if="loadingFile" class="git-diff-detail-empty">
            <ArrowPathIcon class="spinning" aria-hidden="true" />
            Carregando {{ selectedPath }}…
          </div>

          <div v-else-if="fileDiff?.binary" class="git-diff-detail-empty">
            <DocumentTextIcon aria-hidden="true" />
            <strong>Diff binário não disponível</strong>
            <span>O arquivo pode ser revisado pelo editor ou ferramenta Git externa.</span>
          </div>

          <template v-else-if="fileDiff">
            <div v-if="fileDiff.masked || fileDiff.truncated" class="git-diff-warnings">
              <p v-if="fileDiff.masked">
                {{ fileDiff.redactionCount }} possível(is) segredo(s) foram mascarados.
              </p>
              <p v-if="fileDiff.truncated">
                O diff foi truncado para manter a interface responsiva.
              </p>
            </div>

            <div v-if="!fileDiff.content.trim()" class="git-diff-detail-empty">
              <DocumentTextIcon aria-hidden="true" />
              <strong>Diff textual vazio</strong>
              <span>O arquivo pode conter apenas mudança de modo ou metadados.</span>
            </div>

            <div
              v-else-if="viewMode === 'unified'"
              class="git-diff-unified"
              role="table"
              aria-label="Diff unificado"
            >
              <div
                v-for="(line, index) in unifiedLines"
                :key="`${index}-${line.oldLine ?? ''}-${line.newLine ?? ''}`"
                class="git-diff-unified-row"
                :class="`is-${line.kind}`"
                role="row"
              >
                <span class="git-diff-line-number" role="cell">{{ line.oldLine ?? '' }}</span>
                <span class="git-diff-line-number" role="cell">{{ line.newLine ?? '' }}</span>
                <span class="git-diff-line-prefix" role="cell">{{ linePrefix(line.kind) }}</span>
                <code role="cell" v-html="highlighted(line.text)" />
              </div>
            </div>

            <div
              v-else
              class="git-diff-split"
              role="table"
              aria-label="Diff lado a lado"
            >
              <template
                v-for="(row, index) in splitRows"
                :key="`${index}-${row.left?.oldLine ?? ''}-${row.right?.newLine ?? ''}`"
              >
                <div v-if="row.kind === 'meta'" class="git-diff-split-meta">
                  <code v-html="highlighted(row.left?.text ?? row.right?.text ?? '')" />
                </div>

                <div v-else class="git-diff-split-row">
                  <div
                    class="git-diff-side-cell"
                    :class="row.left ? `is-${row.left.kind}` : 'is-empty'"
                  >
                    <span class="git-diff-line-number">{{ row.left?.oldLine ?? '' }}</span>
                    <span class="git-diff-line-prefix">{{ row.left ? linePrefix(row.left.kind) : '' }}</span>
                    <code v-if="row.left" v-html="highlighted(row.left.text)" />
                  </div>
                  <div
                    class="git-diff-side-cell"
                    :class="row.right ? `is-${row.right.kind}` : 'is-empty'"
                  >
                    <span class="git-diff-line-number">{{ row.right?.newLine ?? '' }}</span>
                    <span class="git-diff-line-prefix">{{ row.right ? linePrefix(row.right.kind) : '' }}</span>
                    <code v-if="row.right" v-html="highlighted(row.right.text)" />
                  </div>
                </div>
              </template>
            </div>
          </template>
        </template>

        <div v-else class="git-diff-detail-empty">
          <DocumentTextIcon aria-hidden="true" />
          <strong>Selecione um arquivo</strong>
          <span>O conteúdo alterado aparecerá neste painel.</span>
        </div>
      </main>
    </div>
  </section>
</template>

<style scoped>
.git-diff-page {
  display: grid;
  gap: var(--space-4);
  color: var(--text);
  font-family: var(--font-family);
}

.git-diff-page-heading,
.git-diff-heading-actions,
.git-diff-toolbar,
.git-diff-file-header,
.git-diff-viewer-toolbar,
.git-diff-selected-file,
.git-diff-files-pane > header {
  display: flex;
  align-items: center;
}

.git-diff-page-heading {
  justify-content: space-between;
  gap: var(--space-4);
}

.git-diff-page-heading > div:first-child {
  display: grid;
  gap: 4px;
}

.git-diff-kicker {
  color: var(--accent);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: .08em;
  text-transform: uppercase;
}

.git-diff-page-heading h2 {
  margin: 0;
  font-size: clamp(22px, 2vw, 28px);
  letter-spacing: -.025em;
}

.git-diff-page-heading p {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-diff-page-heading p strong {
  color: var(--text);
}

.git-diff-heading-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.git-diff-scope-switch,
.git-diff-view-switch {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  padding: 3px;
}

.git-diff-scope-switch button,
.git-diff-view-switch button,
.git-diff-refresh-button,
.git-diff-copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: calc(var(--radius-md) - 3px);
  background: transparent;
  color: var(--text-muted);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-diff-scope-switch button:hover,
.git-diff-view-switch button:hover {
  color: var(--text);
}

.git-diff-scope-switch button.active,
.git-diff-view-switch button.active {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
  background: var(--surface-1);
  color: var(--accent);
  box-shadow: var(--shadow-1);
}

.git-diff-refresh-button,
.git-diff-copy-button {
  border-color: var(--border);
  background: var(--surface-1);
}

.git-diff-refresh-button:hover,
.git-diff-copy-button:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.git-diff-refresh-button svg,
.git-diff-copy-button svg,
.git-diff-view-switch svg {
  width: 17px;
  height: 17px;
}

.git-diff-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.git-diff-metrics article {
  display: grid;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  padding: 14px 16px;
}

.git-diff-metrics span,
.git-diff-metrics small {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.git-diff-metrics strong {
  font-size: var(--font-xl);
}

.git-diff-metrics .is-addition strong,
.git-diff-file-stats b {
  color: var(--success-text);
}

.git-diff-metrics .is-deletion strong,
.git-diff-file-stats i {
  color: var(--danger-text);
}

.git-diff-toolbar {
  gap: var(--space-3);
}

.git-diff-file-search,
.git-diff-status-filter,
.git-diff-content-search {
  position: relative;
  display: flex;
  align-items: center;
}

.git-diff-file-search {
  flex: 1;
}

.git-diff-file-search svg,
.git-diff-status-filter svg,
.git-diff-content-search svg {
  position: absolute;
  left: 11px;
  width: 17px;
  height: 17px;
  color: var(--text-muted);
  pointer-events: none;
}

.git-diff-file-search input,
.git-diff-status-filter select,
.git-diff-content-search input {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
  padding: 9px 12px 9px 36px;
  font: inherit;
  font-size: var(--font-sm);
}

.git-diff-status-filter {
  width: min(230px, 35%);
}

.git-diff-workspace {
  display: grid;
  grid-template-columns: minmax(290px, .34fr) minmax(0, 1fr);
  min-height: 590px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-1);
}

.git-diff-files-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
}

.git-diff-files-pane > header {
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border);
  padding: 13px 14px;
}

.git-diff-files-pane > header div {
  display: grid;
  gap: 2px;
}

.git-diff-files-pane h3 {
  margin: 0;
  font-size: var(--font-md);
}

.git-diff-files-pane header span,
.git-diff-files-pane header small {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.git-diff-file-list {
  overflow: auto;
  min-height: 0;
  padding: 7px;
}

.git-diff-file-list > button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  padding: 10px;
  font: inherit;
  text-align: left;
}

.git-diff-file-list > button:hover {
  border-color: var(--border);
  background: var(--surface-1);
}

.git-diff-file-list > button.active {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}

.git-diff-file-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.git-diff-file-copy strong,
.git-diff-file-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-diff-file-copy strong {
  font-size: var(--font-sm);
}

.git-diff-file-copy small {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.git-diff-file-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: var(--font-xs);
  white-space: nowrap;
}

.git-diff-file-stats b,
.git-diff-file-stats i {
  font-style: normal;
  font-weight: var(--font-weight-strong);
}

.git-diff-viewer {
  min-width: 0;
  overflow: hidden;
  background: var(--surface-1);
}

.git-diff-file-header {
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border);
  padding: 13px 16px;
}

.git-diff-selected-file {
  min-width: 0;
  gap: 10px;
}

.git-diff-selected-file > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.git-diff-selected-file h3,
.git-diff-selected-file p {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-diff-selected-file h3 {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: var(--font-sm);
}

.git-diff-selected-file p {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.git-diff-viewer-toolbar {
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  padding: 9px 12px;
}

.git-diff-content-search {
  width: min(360px, 50%);
}

.git-diff-content-search input {
  padding-right: 98px;
}

.git-diff-content-search span {
  position: absolute;
  right: 10px;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.git-diff-unified,
.git-diff-split {
  overflow: auto;
  max-height: 720px;
  background: var(--surface-1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.git-diff-unified-row {
  display: grid;
  grid-template-columns: 48px 48px 22px minmax(max-content, 1fr);
  min-width: max-content;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 48%, transparent);
}

.git-diff-unified-row > * {
  padding-block: 2px;
}

.git-diff-line-number {
  border-right: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  background: var(--surface-2);
  color: var(--text-dim);
  padding-inline: 8px;
  text-align: right;
  user-select: none;
}

.git-diff-line-prefix {
  color: var(--text-muted);
  text-align: center;
  user-select: none;
}

.git-diff-unified-row code,
.git-diff-side-cell code,
.git-diff-split-meta code {
  display: block;
  min-width: max-content;
  color: var(--text);
  padding-inline: 9px 16px;
  white-space: pre;
}

.git-diff-unified-row.is-addition,
.git-diff-side-cell.is-addition {
  background: color-mix(in srgb, var(--success-surface) 72%, transparent);
}

.git-diff-unified-row.is-deletion,
.git-diff-side-cell.is-deletion {
  background: color-mix(in srgb, var(--danger-surface) 72%, transparent);
}

.git-diff-unified-row.is-addition .git-diff-line-prefix,
.git-diff-side-cell.is-addition .git-diff-line-prefix {
  color: var(--success-text);
}

.git-diff-unified-row.is-deletion .git-diff-line-prefix,
.git-diff-side-cell.is-deletion .git-diff-line-prefix {
  color: var(--danger-text);
}

.git-diff-unified-row.is-hunk,
.git-diff-split-meta {
  background: var(--accent-soft);
  color: var(--accent);
}

.git-diff-unified-row.is-meta,
.git-diff-unified-row.is-notice,
.git-diff-split-meta {
  color: var(--text-muted);
}

.git-diff-split-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-width: 920px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 48%, transparent);
}

.git-diff-side-cell {
  display: grid;
  grid-template-columns: 48px 22px minmax(max-content, 1fr);
  min-width: 0;
}

.git-diff-side-cell:first-child {
  border-right: 1px solid var(--border);
}

.git-diff-side-cell.is-empty {
  min-height: 23px;
  background: var(--surface-2);
}

.git-diff-split-meta {
  min-width: 920px;
  border-bottom: 1px solid var(--border);
  padding: 3px 0;
}

.git-diff-warnings {
  display: grid;
  gap: 5px;
  border-bottom: 1px solid var(--border);
  background: var(--warning-surface);
  color: var(--warning-text);
  padding: 9px 14px;
  font-size: var(--font-xs);
}

.git-diff-warnings p {
  margin: 0;
}

.git-diff-empty,
.git-diff-detail-empty,
.git-diff-list-empty {
  display: grid;
  place-items: center;
  color: var(--text-muted);
  text-align: center;
}

.git-diff-empty {
  min-height: 320px;
  gap: 6px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.git-diff-detail-empty {
  min-height: 430px;
  gap: 6px;
  padding: var(--space-5);
}

.git-diff-list-empty {
  min-height: 160px;
  padding: var(--space-4);
  font-size: var(--font-sm);
}

.git-diff-empty svg,
.git-diff-detail-empty svg {
  width: 28px;
  height: 28px;
  color: var(--accent);
}

.git-diff-file-error {
  margin: var(--space-3);
}

:deep(mark) {
  border-radius: 3px;
  background: color-mix(in srgb, var(--warning-text) 24%, transparent);
  color: inherit;
  padding-inline: 1px;
}

.spinning {
  animation: git-diff-spin 900ms linear infinite;
}

@keyframes git-diff-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
  .git-diff-page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .git-diff-heading-actions {
    width: 100%;
    justify-content: space-between;
  }

  .git-diff-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .git-diff-workspace {
    grid-template-columns: minmax(250px, .42fr) minmax(0, 1fr);
  }
}

@media (max-width: 820px) {
  .git-diff-toolbar,
  .git-diff-viewer-toolbar,
  .git-diff-file-header {
    align-items: stretch;
    flex-direction: column;
  }

  .git-diff-status-filter,
  .git-diff-content-search {
    width: 100%;
  }

  .git-diff-workspace {
    grid-template-columns: 1fr;
  }

  .git-diff-files-pane {
    max-height: 330px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .git-diff-heading-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .git-diff-scope-switch {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .git-diff-metrics {
    grid-template-columns: 1fr 1fr;
  }

  .git-diff-scope-switch {
    grid-template-columns: 1fr;
  }

  .git-diff-file-list > button {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .git-diff-file-list :deep(.status-badge) {
    display: none;
  }
}
</style>
