import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

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
import type { GitDiffHunk, GitUnifiedDiffLine } from '../utils/git-diff-view';
import {
  annotateGitDiffWordChanges,
  buildGitDiffContextLines,
  buildSplitGitDiffRows,
  parseUnifiedGitDiff,
  renderGitDiffLineHtml,
  splitGitDiffHunks,
} from '../utils/git-diff-view';

export interface GitDiffHunkState {
  hunk: GitDiffHunk;
  before: GitUnifiedDiffLine[];
  after: GitUnifiedDiffLine[];
  expanding: boolean;
}

export interface GitDiffFileEntry {
  file: GitDiffFile;
  language: string | null;
  loading: boolean;
  loaded: boolean;
  error: string;
  diff: GitFileDiff | null;
  leading: GitUnifiedDiffLine[];
  hunks: GitDiffHunkState[];
  totalLines: number | null;
  collapsed: boolean;
  viewed: boolean;
}

export function useProjectGitDiffPage(props: Readonly<{ projectId: string }>) {
  type DiffViewMode = 'unified' | 'split';
  type DiffStatusFilter = 'all' | GitFileStatus;

  const VIEW_MODE_KEY = 'dev-dashboard-git-diff-view-mode';
  /** Quantas linhas cada clique nas setas do cabeçalho `@@` traz. */
  const CONTEXT_EXPANSION_STEP = 20;
  /** Diffs carregados em paralelo — cada um é um `git diff` no projeto. */
  const MAX_PARALLEL_FILE_DIFFS = 3;

  type HunkState = GitDiffHunkState;
  type FileEntry = GitDiffFileEntry;

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
  /** Descarta respostas de `loadOverview()` fora de ordem numa troca rápida de projeto. */
  let overviewGeneration = 0;
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
      return window.localStorage.getItem(VIEW_MODE_KEY) === 'split'
        ? 'split'
        : 'unified';
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
    return entries.value.filter((entry) => {
      if (
        statusFilter.value !== 'all' &&
        entry.file.status !== statusFilter.value
      )
        return false;
      return true;
    });
  });

  /** Com um único arquivo alterado, o filtro de status não tem o que filtrar. */
  const hasSingleChangedFile = computed(() => entries.value.length <= 1);

  const totalAdditions = computed(() =>
    entries.value.reduce((total, entry) => total + entry.file.additions, 0),
  );

  const totalDeletions = computed(() =>
    entries.value.reduce((total, entry) => total + entry.file.deletions, 0),
  );

  const viewedCount = computed(
    () => entries.value.filter((entry) => entry.viewed).length,
  );

  const viewedPercent = computed(() =>
    entries.value.length === 0
      ? 0
      : Math.round((viewedCount.value / entries.value.length) * 100),
  );

  const allCollapsed = computed(
    () =>
      entries.value.length > 0 &&
      entries.value.every((entry) => entry.collapsed),
  );

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
    const additions =
      entry.file.additions === 0
        ? 0
        : Math.max(1, Math.round((entry.file.additions / total) * 5));
    const deletions =
      entry.file.deletions === 0 ? 0 : Math.max(1, 5 - additions);
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
    return lines.map((line) =>
      line.kind === 'addition' ||
      line.kind === 'deletion' ||
      line.kind === 'context'
        ? { ...line, syntax: syntaxRangesFor(line.text, language) }
        : line,
    );
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

  function nextExpansionBelow(
    state: HunkState,
    entry: FileEntry,
  ): number | null {
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

    const start =
      direction === 'up'
        ? Math.max(
            1,
            (nextExpansionAbove(state) ?? 1) - CONTEXT_EXPANSION_STEP + 1,
          )
        : nextExpansionBelow(state, entry);
    const end =
      direction === 'up'
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
        buildGitDiffContextLines(
          result.lines,
          result.start,
          state.hunk.lineOffset,
        ),
        entry.language,
        syntax?.syntaxRangesFor ?? (() => []),
      );
      if (direction === 'up') state.before = [...context, ...state.before];
      else state.after = [...state.after, ...context];
    } catch (error) {
      entry.error =
        error instanceof Error
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
      const parsed = annotateGitDiffWordChanges(
        parseUnifiedGitDiff(diff.content),
      );

      const syntax = await loadSyntaxModule();
      if (controller.signal.aborted) return;
      const language = syntax
        ? syntax.detectLanguage(entry.file.path, detectionSample(parsed))
        : null;
      const lines = syntax
        ? withSyntax(parsed, language, syntax.syntaxRangesFor)
        : parsed;

      const { leading, hunks } = splitGitDiffHunks(lines);
      entry.language = language;
      entry.diff = diff;
      entry.leading = leading;
      entry.hunks = hunks.map((hunk) => ({
        hunk,
        before: [],
        after: [],
        expanding: false,
      }));
      entry.loaded = true;
    } catch (error) {
      if (controller.signal.aborted) return;
      entry.error =
        error instanceof Error
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
    else
      requestFileDiff(
        entries.value.find((entry) => entry.file.path === filePath)!,
      );
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
          const entry = entries.value.find(
            (item) => item.file.path === filePath,
          );
          if (entry) requestFileDiff(entry);
        }
      },
      { rootMargin: '600px 0px' },
    );
    for (const element of cardElements.values()) observer.observe(element);
  }

  async function loadOverview(): Promise<void> {
    const requestGeneration = ++overviewGeneration;
    try {
      const result = await fetchProjectGit(props.projectId);
      if (requestGeneration !== overviewGeneration) return;
      overview.value = result;
    } catch {
      if (requestGeneration !== overviewGeneration) return;
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
      const result = await fetchProjectGitDiff(
        props.projectId,
        scope,
        controller.signal,
      );
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
      snapshotError.value =
        error instanceof Error
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

  return {
    VIEW_MODE_KEY,
    CONTEXT_EXPANSION_STEP,
    MAX_PARALLEL_FILE_DIFFS,
    scope,
    syntaxModule,
    loadSyntaxModule,
    snapshot,
    overview,
    entries,
    statusFilter,
    viewMode,
    loadingSnapshot,
    snapshotError,
    copiedPath,
    cardElements,
    pendingLoads,
    snapshotController,
    fileControllers,
    observer,
    copyTimer,
    statusLabels,
    statusOptions,
    readStoredViewMode,
    persistViewMode,
    branchLabel,
    visibleEntries,
    hasSingleChangedFile,
    totalAdditions,
    totalDeletions,
    viewedCount,
    viewedPercent,
    allCollapsed,
    fileName,
    directoryName,
    linePrefix,
    statBlocks,
    highlighted,
    withSyntax,
    detectionSample,
    hunkLines,
    splitRowsFor,
    nextExpansionAbove,
    nextExpansionBelow,
    canExpandAbove,
    canExpandBelow,
    expandContext,
    buildEntry,
    loadFileDiff,
    requestFileDiff,
    drainPendingLoads,
    registerCard,
    setupObserver,
    loadOverview,
    loadSnapshot,
    refresh,
    toggleCollapsed,
    toggleAll,
    toggleViewed,
    selectViewMode,
    copyPath,
  };
}
