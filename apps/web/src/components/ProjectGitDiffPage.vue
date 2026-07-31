<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
  reactive,
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
  fetchProjectGitFileLines,
} from '../api';
import type {
  GitDiffHunk,
  GitUnifiedDiffLine,
} from '../utils/git-diff-view';
import {
  annotateGitDiffWordChanges,
  buildGitDiffContextLines,
  buildSplitGitDiffRows,
  countGitDiffMatches,
  parseUnifiedGitDiff,
  renderGitDiffLineHtml,
  splitGitDiffHunks,
} from '../utils/git-diff-view';
import { gitFileToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  projectId: string;
}>();

type DiffViewMode = 'unified' | 'split';
type DiffStatusFilter = 'all' | GitFileStatus;

const VIEW_MODE_KEY = 'dev-dashboard-git-diff-view-mode';
/** Quantas linhas cada clique nas setas do cabeçalho `@@` traz. */
const CONTEXT_EXPANSION_STEP = 20;
/** Diffs carregados em paralelo — cada um é um `git diff` no projeto. */
const MAX_PARALLEL_FILE_DIFFS = 3;

interface HunkState {
  hunk: GitDiffHunk;
  before: GitUnifiedDiffLine[];
  after: GitUnifiedDiffLine[];
  expanding: boolean;
}

interface FileEntry {
  file: GitDiffFile;
  language: string | null;
  loading: boolean;
  loaded: boolean;
  error: string;
  diff: GitFileDiff | null;
  leading: GitUnifiedDiffLine[];
  hunks: HunkState[];
  totalLines: number | null;
  collapsed: boolean;
  viewed: boolean;
}

const scope: GitDiffScope = 'combined';

type SyntaxModule = typeof import('../utils/git-diff-syntax');

let syntaxModule: Promise<SyntaxModule | null> | undefined;

/**
 * O highlight.js só é baixado quando alguém abre um diff — fora daqui ele não
 * pesa no bundle inicial do dashboard.
 */
function loadSyntaxModule(): Promise<SyntaxModule | null> {
  syntaxModule ??= import('../utils/git-diff-syntax').catch(() => null);
  return syntaxModule;
}

const snapshot = ref<GitDiffSnapshot | null>(null);
const overview = ref<ProjectGitOverview | null>(null);
const entries = ref<FileEntry[]>([]);
const fileSearch = ref('');
const diffSearch = ref('');
const statusFilter = ref<DiffStatusFilter>('all');
const viewMode = ref<DiffViewMode>(readStoredViewMode());
const loadingSnapshot = ref(false);
const snapshotError = ref('');
const copiedPath = ref('');

const cardElements = new Map<string, HTMLElement>();
const pendingLoads = new Set<string>();
let snapshotController: AbortController | undefined;
let fileControllers: AbortController[] = [];
let observer: IntersectionObserver | undefined;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

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

const statusOptions: Array<{ value: DiffStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'modified', label: 'Modificados' },
  { value: 'added', label: 'Adicionados' },
  { value: 'deleted', label: 'Removidos' },
  { value: 'renamed', label: 'Renomeados' },
  { value: 'untracked', label: 'Não rastreados' },
  { value: 'conflicted', label: 'Com conflito' },
];

function readStoredViewMode(): DiffViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

function persistViewMode(value: DiffViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, value);
  } catch {
    // Preferência visual opcional.
  }
}

const branchLabel = computed(() => {
  if (!overview.value) return 'Carregando branch…';
  if (overview.value.detached) return 'HEAD destacado';
  return overview.value.branch ?? 'Repositório sem commits';
});

const visibleEntries = computed(() => {
  const query = fileSearch.value.trim().toLocaleLowerCase('pt-BR');
  return entries.value.filter((entry) => {
    if (statusFilter.value !== 'all' && entry.file.status !== statusFilter.value) return false;
    if (!query) return true;
    return [entry.file.path, entry.file.previousPath ?? '', statusLabels[entry.file.status]]
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
  });
});

const totalAdditions = computed(() =>
  entries.value.reduce((total, entry) => total + entry.file.additions, 0),
);

const totalDeletions = computed(() =>
  entries.value.reduce((total, entry) => total + entry.file.deletions, 0),
);

const viewedCount = computed(() => entries.value.filter((entry) => entry.viewed).length);

const viewedPercent = computed(() => (
  entries.value.length === 0 ? 0 : Math.round((viewedCount.value / entries.value.length) * 100)
));

const allCollapsed = computed(() =>
  entries.value.length > 0 && entries.value.every((entry) => entry.collapsed),
);

const diffMatchCount = computed(() => entries.value.reduce(
  (total, entry) => total + countGitDiffMatches(entry.diff?.content ?? '', diffSearch.value),
  0,
));

function fileName(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}

function directoryName(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join('/')}/` : '';
}

function linePrefix(kind: string): string {
  if (kind === 'addition') return '+';
  if (kind === 'deletion') return '−';
  if (kind === 'context') return ' ';
  return '';
}

function statBlocks(entry: FileEntry): Array<'add' | 'del' | 'empty'> {
  const total = entry.file.additions + entry.file.deletions;
  if (total === 0) return Array.from({ length: 5 }, () => 'empty');
  const additions = entry.file.additions === 0
    ? 0
    : Math.max(1, Math.round((entry.file.additions / total) * 5));
  const deletions = entry.file.deletions === 0 ? 0 : Math.max(1, 5 - additions);
  const effectiveAdditions = Math.min(additions, 5 - deletions);
  return Array.from({ length: 5 }, (_unused, index) => {
    if (index < effectiveAdditions) return 'add';
    if (index < effectiveAdditions + deletions) return 'del';
    return 'empty';
  });
}

function highlighted(line: GitUnifiedDiffLine): string {
  return renderGitDiffLineHtml(line.text, {
    ...(line.words ? { words: line.words } : {}),
    ...(line.syntax ? { syntax: line.syntax } : {}),
    query: diffSearch.value,
  });
}

/**
 * O realce de sintaxe é caro e não muda enquanto o arquivo não recarrega —
 * calculamos as faixas uma vez, na carga e a cada expansão de contexto.
 */
function withSyntax(
  lines: readonly GitUnifiedDiffLine[],
  language: string | null,
  syntaxRangesFor: SyntaxModule['syntaxRangesFor'],
): GitUnifiedDiffLine[] {
  if (!language) return [...lines];
  return lines.map((line) => (
    line.kind === 'addition' || line.kind === 'deletion' || line.kind === 'context'
      ? { ...line, syntax: syntaxRangesFor(line.text, language) }
      : line
  ));
}

/** Amostra do lado novo do arquivo, usada quando a extensão não diz nada. */
function detectionSample(lines: readonly GitUnifiedDiffLine[]): string {
  return lines
    .filter((line) => line.kind === 'context' || line.kind === 'addition')
    .slice(0, 80)
    .map((line) => line.text)
    .join('\n');
}

/**
 * Junta o hunk com o contexto já expandido acima e abaixo dele. O cabeçalho
 * `@@` fica de fora: ele é renderizado à parte, com as setas de expansão.
 */
function hunkLines(state: HunkState): GitUnifiedDiffLine[] {
  return [...state.before, ...state.hunk.lines, ...state.after];
}

function splitRowsFor(state: HunkState) {
  return buildSplitGitDiffRows(hunkLines(state));
}

function nextExpansionAbove(state: HunkState): number | null {
  const first = state.before[0]?.newLine ?? state.hunk.firstNewLine;
  if (first === null || first <= 1) return null;
  return first - 1;
}

function nextExpansionBelow(state: HunkState, entry: FileEntry): number | null {
  const last = state.after.at(-1)?.newLine ?? state.hunk.lastNewLine;
  if (last === null) return null;
  if (entry.totalLines !== null && last >= entry.totalLines) return null;
  return last + 1;
}

function canExpandAbove(state: HunkState, entry: FileEntry): boolean {
  return !entry.diff?.binary && nextExpansionAbove(state) !== null;
}

function canExpandBelow(state: HunkState, entry: FileEntry): boolean {
  return !entry.diff?.binary && nextExpansionBelow(state, entry) !== null;
}

async function expandContext(
  entry: FileEntry,
  state: HunkState,
  direction: 'up' | 'down',
): Promise<void> {
  if (state.expanding) return;

  const start = direction === 'up'
    ? Math.max(1, (nextExpansionAbove(state) ?? 1) - CONTEXT_EXPANSION_STEP + 1)
    : nextExpansionBelow(state, entry);
  const end = direction === 'up'
    ? nextExpansionAbove(state)
    : (nextExpansionBelow(state, entry) ?? 0) + CONTEXT_EXPANSION_STEP - 1;
  if (start === null || end === null || end < start) return;

  state.expanding = true;
  try {
    const result = await fetchProjectGitFileLines(
      props.projectId,
      entry.file.path,
      scope,
      start,
      end,
    );
    entry.totalLines = result.totalLines;
    const syntax = await loadSyntaxModule();
    const context = withSyntax(
      buildGitDiffContextLines(result.lines, result.start, state.hunk.lineOffset),
      entry.language,
      syntax?.syntaxRangesFor ?? (() => []),
    );
    if (direction === 'up') state.before = [...context, ...state.before];
    else state.after = [...state.after, ...context];
  } catch (error) {
    entry.error = error instanceof Error
      ? error.message
      : 'Não foi possível carregar mais linhas deste arquivo.';
  } finally {
    state.expanding = false;
  }
}

function buildEntry(file: GitDiffFile): FileEntry {
  return reactive<FileEntry>({
    file,
    language: null,
    loading: false,
    loaded: false,
    error: '',
    diff: null,
    leading: [],
    hunks: [],
    totalLines: null,
    collapsed: false,
    viewed: false,
  });
}

async function loadFileDiff(entry: FileEntry): Promise<void> {
  if (entry.loaded || entry.loading) return;
  entry.loading = true;
  entry.error = '';

  const controller = new AbortController();
  fileControllers.push(controller);

  try {
    const diff = await fetchProjectGitFileDiff(
      props.projectId,
      entry.file.path,
      scope,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    const parsed = annotateGitDiffWordChanges(parseUnifiedGitDiff(diff.content));

    const syntax = await loadSyntaxModule();
    if (controller.signal.aborted) return;
    const language = syntax
      ? syntax.detectLanguage(entry.file.path, detectionSample(parsed))
      : null;
    const lines = syntax ? withSyntax(parsed, language, syntax.syntaxRangesFor) : parsed;

    const { leading, hunks } = splitGitDiffHunks(lines);
    entry.language = language;
    entry.diff = diff;
    entry.leading = leading;
    entry.hunks = hunks.map((hunk) => ({ hunk, before: [], after: [], expanding: false }));
    entry.loaded = true;
  } catch (error) {
    if (controller.signal.aborted) return;
    entry.error = error instanceof Error
      ? error.message
      : 'Não foi possível carregar o diff deste arquivo.';
  } finally {
    if (!controller.signal.aborted) entry.loading = false;
    fileControllers = fileControllers.filter((item) => item !== controller);
  }
}

/** Enfileira a carga sob demanda, limitando quantos diffs correm juntos. */
function requestFileDiff(entry: FileEntry): void {
  if (entry.loaded || entry.loading) return;
  pendingLoads.add(entry.file.path);
  void drainPendingLoads();
}

async function drainPendingLoads(): Promise<void> {
  const running = entries.value.filter((entry) => entry.loading).length;
  let slots = MAX_PARALLEL_FILE_DIFFS - running;

  for (const path of [...pendingLoads]) {
    if (slots <= 0) return;
    const entry = entries.value.find((item) => item.file.path === path);
    pendingLoads.delete(path);
    if (!entry || entry.loaded || entry.loading) continue;
    slots -= 1;
    void loadFileDiff(entry).then(() => drainPendingLoads());
  }
}

function registerCard(element: Element | null, filePath: string): void {
  if (!element || !(element instanceof HTMLElement)) {
    const previous = cardElements.get(filePath);
    if (previous && observer) observer.unobserve(previous);
    cardElements.delete(filePath);
    return;
  }
  cardElements.set(filePath, element);
  if (observer) observer.observe(element);
  else requestFileDiff(entries.value.find((entry) => entry.file.path === filePath)!);
}

function setupObserver(): void {
  observer?.disconnect();
  if (typeof IntersectionObserver === 'undefined') {
    observer = undefined;
    return;
  }
  observer = new IntersectionObserver(
    (records) => {
      for (const record of records) {
        if (!record.isIntersecting) continue;
        const filePath = (record.target as HTMLElement).dataset.gitDiffPath;
        const entry = entries.value.find((item) => item.file.path === filePath);
        if (entry) requestFileDiff(entry);
      }
    },
    { rootMargin: '600px 0px' },
  );
  for (const element of cardElements.values()) observer.observe(element);
}

async function loadOverview(): Promise<void> {
  try {
    overview.value = await fetchProjectGit(props.projectId);
  } catch {
    overview.value = null;
  }
}

async function loadSnapshot(): Promise<void> {
  snapshotController?.abort();
  for (const controller of fileControllers) controller.abort();
  fileControllers = [];
  pendingLoads.clear();

  const controller = new AbortController();
  snapshotController = controller;
  loadingSnapshot.value = true;
  snapshotError.value = '';

  try {
    const result = await fetchProjectGitDiff(props.projectId, scope, controller.signal);
    if (controller.signal.aborted) return;
    snapshot.value = result;
    entries.value = result.files.map(buildEntry);
    await nextTick();
    setupObserver();
    // Sem observer (ambiente sem IntersectionObserver) tudo entra na fila.
    if (!observer) for (const entry of entries.value) requestFileDiff(entry);
  } catch (error) {
    if (controller.signal.aborted) return;
    snapshot.value = null;
    entries.value = [];
    snapshotError.value = error instanceof Error
      ? error.message
      : 'Não foi possível carregar as alterações do projeto.';
  } finally {
    if (!controller.signal.aborted) loadingSnapshot.value = false;
  }
}

async function refresh(): Promise<void> {
  await Promise.all([loadOverview(), loadSnapshot()]);
}

function toggleCollapsed(entry: FileEntry): void {
  entry.collapsed = !entry.collapsed;
  if (!entry.collapsed) requestFileDiff(entry);
}

function toggleAll(): void {
  const collapse = !allCollapsed.value;
  for (const entry of entries.value) entry.collapsed = collapse;
}

function toggleViewed(entry: FileEntry, viewed: boolean): void {
  entry.viewed = viewed;
  entry.collapsed = viewed;
}

function selectViewMode(mode: DiffViewMode): void {
  viewMode.value = mode;
  persistViewMode(mode);
}

async function copyPath(entry: FileEntry): Promise<void> {
  try {
    await navigator.clipboard.writeText(entry.file.path);
    copiedPath.value = entry.file.path;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedPath.value = '';
    }, 1_800);
  } catch {
    copiedPath.value = '';
  }
}

watch(
  () => props.projectId,
  () => {
    diffSearch.value = '';
    fileSearch.value = '';
    void refresh();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  snapshotController?.abort();
  for (const controller of fileControllers) controller.abort();
  observer?.disconnect();
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
          <span>Staged e não staged</span>
          <span aria-hidden="true">·</span>
          <span><b>{{ entries.length }}</b> arquivo(s)</span>
          <span aria-hidden="true">·</span>
          <span class="git-diff-delta">
            <b class="is-addition">+{{ totalAdditions }}</b>
            <b class="is-deletion">−{{ totalDeletions }}</b>
          </span>
        </p>
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
    </header>

    <div v-if="snapshotError" class="project-error" role="alert">
      {{ snapshotError }}
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
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="git-diff-content-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          v-model="diffSearch"
          type="search"
          placeholder="Buscar no conteúdo…"
          aria-label="Buscar dentro dos diffs carregados"
        />
        <span v-if="diffSearch.trim()">{{ diffMatchCount }} ocorrência(s)</span>
      </label>

      <div class="git-diff-view-switch" aria-label="Modo de visualização">
        <button
          type="button"
          :class="{ active: viewMode === 'unified' }"
          :aria-pressed="viewMode === 'unified'"
          @click="selectViewMode('unified')"
        >
          <Bars3BottomLeftIcon aria-hidden="true" />
          Unificado
        </button>
        <button
          type="button"
          :class="{ active: viewMode === 'split' }"
          :aria-pressed="viewMode === 'split'"
          @click="selectViewMode('split')"
        >
          <ViewColumnsIcon aria-hidden="true" />
          Lado a lado
        </button>
      </div>

      <button
        v-if="entries.length > 0"
        class="git-diff-collapse-all"
        type="button"
        @click="toggleAll"
      >
        {{ allCollapsed ? 'Expandir tudo' : 'Recolher tudo' }}
      </button>

      <div v-if="entries.length > 0" class="git-diff-progress">
        <span>{{ viewedCount }} de {{ entries.length }} revisados</span>
        <span
          class="git-diff-progress-track"
          role="progressbar"
          :aria-valuenow="viewedPercent"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Arquivos revisados"
        >
          <span class="git-diff-progress-bar" :style="{ width: `${viewedPercent}%` }"></span>
        </span>
      </div>
    </div>

    <div v-if="loadingSnapshot && !snapshot" class="git-diff-empty">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      <strong>Carregando alterações</strong>
      <span>Consultando arquivos staged e o working tree.</span>
    </div>

    <div v-else-if="snapshot && entries.length === 0" class="git-diff-empty">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhuma alteração para revisar</strong>
      <span>A árvore de trabalho está igual ao último commit.</span>
    </div>

    <div v-else-if="visibleEntries.length === 0 && snapshot" class="git-diff-empty">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhum arquivo corresponde aos filtros</strong>
      <span>Ajuste a busca ou o status selecionado.</span>
    </div>

    <div v-else class="git-diff-file-stack">
      <article
        v-for="entry in visibleEntries"
        :key="entry.file.path"
        :ref="(element) => registerCard(element as Element | null, entry.file.path)"
        class="git-diff-file-card"
        :class="{ 'is-collapsed': entry.collapsed }"
        :data-git-diff-path="entry.file.path"
      >
        <header class="git-diff-file-head">
          <button
            type="button"
            class="git-diff-chevron"
            :aria-expanded="!entry.collapsed"
            :aria-label="entry.collapsed ? `Expandir ${entry.file.path}` : `Recolher ${entry.file.path}`"
            @click="toggleCollapsed(entry)"
          >
            <ChevronDownIcon aria-hidden="true" />
          </button>

          <span class="git-diff-file-path" :title="entry.file.path">
            <span class="git-diff-file-dir">{{ directoryName(entry.file.path) }}</span>
            <strong>{{ fileName(entry.file.path) }}</strong>
            <small v-if="entry.file.previousPath">de {{ entry.file.previousPath }}</small>
          </span>

          <button
            type="button"
            class="git-diff-copy-button"
            :class="{ 'is-done': copiedPath === entry.file.path }"
            :title="copiedPath === entry.file.path ? 'Caminho copiado' : 'Copiar caminho do arquivo'"
            :aria-label="`Copiar caminho de ${entry.file.path}`"
            @click="copyPath(entry)"
          >
            <ClipboardDocumentIcon aria-hidden="true" />
          </button>

          <div class="git-diff-file-meta">
            <StatusBadge :tone="gitFileToneFor(entry.file.status)">
              {{ statusLabels[entry.file.status] }}
            </StatusBadge>

            <span v-if="entry.file.binary" class="git-diff-file-counts">binário</span>
            <span v-else class="git-diff-file-counts git-diff-delta">
              <b class="is-addition">+{{ entry.file.additions }}</b>
              <b class="is-deletion">−{{ entry.file.deletions }}</b>
            </span>

            <span class="git-diff-statbar" aria-hidden="true">
              <i
                v-for="(block, index) in statBlocks(entry)"
                :key="index"
                :class="`is-${block}`"
              ></i>
            </span>

            <label class="git-diff-viewed">
              <input
                type="checkbox"
                :checked="entry.viewed"
                @change="toggleViewed(entry, ($event.target as HTMLInputElement).checked)"
              />
              Revisado
            </label>
          </div>
        </header>

        <div v-if="!entry.collapsed" class="git-diff-file-body">
          <p v-if="entry.error" class="project-error git-diff-file-error" role="alert">
            {{ entry.error }}
          </p>

          <div v-else-if="entry.loading || !entry.loaded" class="git-diff-detail-empty">
            <ArrowPathIcon class="spinning" aria-hidden="true" />
            Carregando {{ entry.file.path }}…
          </div>

          <div v-else-if="entry.diff?.binary" class="git-diff-detail-empty">
            <DocumentTextIcon aria-hidden="true" />
            <strong>Diff binário não disponível</strong>
            <span>O arquivo pode ser revisado por um editor ou ferramenta Git externa.</span>
          </div>

          <template v-else-if="entry.diff">
            <div v-if="entry.diff.masked || entry.diff.truncated" class="git-diff-warnings">
              <p v-if="entry.diff.masked">
                {{ entry.diff.redactionCount }} possível(is) segredo(s) foram mascarados.
              </p>
              <p v-if="entry.diff.truncated">
                O diff foi truncado para manter a interface responsiva.
              </p>
            </div>

            <div v-if="entry.hunks.length === 0" class="git-diff-detail-empty">
              <DocumentTextIcon aria-hidden="true" />
              <strong>Diff textual vazio</strong>
              <span>O arquivo pode conter apenas mudança de modo ou metadados.</span>
            </div>

            <div
              v-else
              :class="viewMode === 'split' ? 'git-diff-split' : 'git-diff-unified'"
              role="table"
              :aria-label="`Diff de ${entry.file.path}`"
            >
              <div
                v-for="(line, index) in entry.leading"
                :key="`leading-${index}`"
                class="git-diff-unified-row is-meta"
                role="row"
              >
                <span class="git-diff-line-number" role="cell"></span>
                <span class="git-diff-line-number" role="cell"></span>
                <span class="git-diff-line-prefix" role="cell"></span>
                <code role="cell" v-html="highlighted(line)"></code>
              </div>

              <template v-for="(state, hunkIndex) in entry.hunks" :key="`hunk-${hunkIndex}`">
                <div class="git-diff-hunk-head" role="row" data-git-action-feedback="off">
                  <button
                    type="button"
                    class="git-diff-expand"
                    :disabled="!canExpandAbove(state, entry) || state.expanding"
                    :title="`Mostrar ${CONTEXT_EXPANSION_STEP} linhas acima`"
                    :aria-label="`Mostrar ${CONTEXT_EXPANSION_STEP} linhas acima de ${entry.file.path}`"
                    @click="expandContext(entry, state, 'up')"
                  >
                    <ChevronUpIcon aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="git-diff-expand"
                    :disabled="!canExpandBelow(state, entry) || state.expanding"
                    :title="`Mostrar ${CONTEXT_EXPANSION_STEP} linhas abaixo`"
                    :aria-label="`Mostrar ${CONTEXT_EXPANSION_STEP} linhas abaixo de ${entry.file.path}`"
                    @click="expandContext(entry, state, 'down')"
                  >
                    <ChevronDownIcon aria-hidden="true" />
                  </button>
                  <code role="cell">{{ state.hunk.header.text }}</code>
                </div>

                <template v-if="viewMode === 'unified'">
                  <div
                    v-for="(line, lineIndex) in hunkLines(state)"
                    :key="`u-${hunkIndex}-${lineIndex}`"
                    class="git-diff-unified-row"
                    :class="`is-${line.kind}`"
                    role="row"
                  >
                    <span class="git-diff-line-number" role="cell">{{ line.oldLine ?? '' }}</span>
                    <span class="git-diff-line-number" role="cell">{{ line.newLine ?? '' }}</span>
                    <span class="git-diff-line-prefix" role="cell">{{ linePrefix(line.kind) }}</span>
                    <code role="cell" v-html="highlighted(line)"></code>
                  </div>
                </template>

                <template v-else>
                  <template
                    v-for="(row, rowIndex) in splitRowsFor(state)"
                    :key="`s-${hunkIndex}-${rowIndex}`"
                  >
                    <div v-if="row.kind === 'meta'" class="git-diff-split-meta" role="row">
                      <code role="cell" v-html="highlighted(row.left ?? row.right!)"></code>
                    </div>

                    <div v-else class="git-diff-split-row" role="row">
                      <div
                        class="git-diff-side-cell"
                        :class="row.left ? `is-${row.left.kind}` : 'is-empty'"
                      >
                        <span class="git-diff-line-number" role="cell">{{ row.left?.oldLine ?? '' }}</span>
                        <span class="git-diff-line-prefix" role="cell">{{ row.left ? linePrefix(row.left.kind) : '' }}</span>
                        <code v-if="row.left" role="cell" v-html="highlighted(row.left)"></code>
                        <code v-else role="cell"></code>
                      </div>
                      <div
                        class="git-diff-side-cell"
                        :class="row.right ? `is-${row.right.kind}` : 'is-empty'"
                      >
                        <span class="git-diff-line-number" role="cell">{{ row.right?.newLine ?? '' }}</span>
                        <span class="git-diff-line-prefix" role="cell">{{ row.right ? linePrefix(row.right.kind) : '' }}</span>
                        <code v-if="row.right" role="cell" v-html="highlighted(row.right)"></code>
                        <code v-else role="cell"></code>
                      </div>
                    </div>
                  </template>
                </template>
              </template>
            </div>
          </template>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped src="./ProjectGitDiffPage.css"></style>
