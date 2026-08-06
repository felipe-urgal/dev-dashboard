import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import type {
  GitCommitDetailFile,
  GitCommitDetails,
  GitCommitFileDiff,
  GitCommitHistoryEntry,
  GitCommitHistoryKind,
  GitCommitHistoryPage,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import type { ProjectGitHistoryScope } from '../api';
import {
  fetchProjectGitCommitDetail,
  fetchProjectGitCommitFileDiff,
  fetchProjectGitCommits,
} from '../api';
import { fetchProjectGitWorkspace } from '../api/git-workspace';

export function useProjectGitHistoryPage(
  props: Readonly<{ projectId: string }>,
) {
  const PAGE_SIZE = 20;
  const VIEW_MODE_KEY = 'dev-dashboard-git-history-view-mode';
  const LIST_WIDTH_KEY = 'dev-dashboard-git-history-list-width';
  const DEFAULT_LIST_WIDTH = 260;
  const MIN_LIST_WIDTH = 160;
  const MAX_LIST_WIDTH = 560;
  const RESIZE_KEYBOARD_STEP = 16;

  type DiffViewMode = 'unified' | 'split';

  interface FileState {
    file: GitCommitDetailFile;
    loading: boolean;
    error: string;
    diff: GitCommitFileDiff | null;
  }

  const history = ref<GitCommitHistoryPage | null>(null);
  const workspace = ref<ProjectGitWorkspace | null>(null);
  const reference = ref('');
  const search = ref('');
  const author = ref('');
  const kind = ref<GitCommitHistoryKind>('all');
  /** Como hoje, a tela abre nos commits que só existem nesta branch. */
  const scope = ref<ProjectGitHistoryScope>('exclusive');
  const page = ref(1);
  const loading = ref(false);
  const errorMessage = ref('');

  const detail = ref<GitCommitDetails | null>(null);
  const detailLoading = ref(false);
  const detailError = ref('');
  const selectedHash = ref('');
  const fileStates = ref<FileState[]>([]);
  const selectedFilePath = ref('');
  const viewMode = ref<DiffViewMode>(readStoredViewMode());
  const copiedHash = ref('');
  const listWidth = ref(readStoredListWidth());
  const resizingList = ref(false);
  const diffLayoutEl = ref<HTMLElement | null>(null);

  let historyController: AbortController | undefined;
  let detailController: AbortController | undefined;
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  const statusLabels: Record<GitCommitDetailFile['status'], string> = {
    added: 'Adicionado',
    modified: 'Modificado',
    deleted: 'Removido',
    renamed: 'Renomeado',
    copied: 'Copiado',
    'type-changed': 'Tipo alterado',
  };

  const scopeOptions: Array<{ value: ProjectGitHistoryScope; label: string }> =
    [
      { value: 'exclusive', label: 'Commits exclusivos' },
      { value: 'all', label: 'Todos da referência' },
    ];

  const kindOptions: Array<{ value: GitCommitHistoryKind; label: string }> = [
    { value: 'all', label: 'Todos os commits' },
    { value: 'regular', label: 'Sem merges' },
    { value: 'merge', label: 'Somente merges' },
  ];

  function clampListWidth(value: number): number {
    return Math.min(
      MAX_LIST_WIDTH,
      Math.max(MIN_LIST_WIDTH, Math.round(value)),
    );
  }

  function readStoredListWidth(): number {
    try {
      const raw = window.localStorage.getItem(LIST_WIDTH_KEY);
      const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(value)
        ? clampListWidth(value)
        : DEFAULT_LIST_WIDTH;
    } catch {
      return DEFAULT_LIST_WIDTH;
    }
  }

  function persistListWidth(value: number): void {
    try {
      window.localStorage.setItem(LIST_WIDTH_KEY, String(value));
    } catch {
      // Preferência visual opcional.
    }
  }

  /** Arrastar a divisória entre a lista de arquivos e o diff. */
  function startListResize(event: PointerEvent): void {
    event.preventDefault();
    const layout = diffLayoutEl.value;
    if (!layout) return;

    const { left } = layout.getBoundingClientRect();
    resizingList.value = true;

    const onMove = (moveEvent: PointerEvent): void => {
      listWidth.value = clampListWidth(moveEvent.clientX - left);
    };
    const onUp = (): void => {
      resizingList.value = false;
      persistListWidth(listWidth.value);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleResizeKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta =
      event.key === 'ArrowLeft' ? -RESIZE_KEYBOARD_STEP : RESIZE_KEYBOARD_STEP;
    listWidth.value = clampListWidth(listWidth.value + delta);
    persistListWidth(listWidth.value);
  }

  function readStoredViewMode(): DiffViewMode {
    try {
      return window.localStorage.getItem(VIEW_MODE_KEY) === 'split'
        ? 'split'
        : 'unified';
    } catch {
      return 'unified';
    }
  }

  function selectViewMode(mode: DiffViewMode): void {
    viewMode.value = mode;
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Preferência visual opcional.
    }
  }

  const branchGroups = computed(() => {
    const branches = workspace.value?.branches ?? [];
    return [
      {
        label: 'Branches locais',
        items: branches.filter((branch) => branch.kind === 'local'),
      },
      {
        label: 'Origin',
        items: branches.filter(
          (branch) => branch.kind === 'remote' && branch.remote === 'origin',
        ),
      },
      {
        label: 'Outros remotos',
        items: branches.filter(
          (branch) => branch.kind === 'remote' && branch.remote !== 'origin',
        ),
      },
    ].filter((group) => group.items.length > 0);
  });

  const authorOptions = computed(() => {
    const names = new Map<string, string>();
    for (const commit of history.value?.commits ?? []) {
      if (!names.has(commit.authorEmail))
        names.set(commit.authorEmail, commit.authorName);
    }
    return [...names.entries()].map(([email, name]) => ({ email, name }));
  });

  /** `%B` traz a mensagem inteira; o assunto já aparece no título do modal. */
  const commitBody = computed(() => {
    const body = detail.value?.body ?? '';
    const subject = detail.value?.subject ?? '';
    return (
      body.startsWith(subject) ? body.slice(subject.length) : body
    ).trim();
  });

  const totalPages = computed(() =>
    Math.max(1, history.value?.totalPages ?? 1),
  );

  /**
   * Repositórios grandes têm centenas de páginas: mostramos uma janela ao redor
   * da atual, com as pontas sempre acessíveis.
   */
  const pageWindow = computed<Array<number | 'gap'>>(() => {
    const total = totalPages.value;
    const current = page.value;
    if (total <= 7)
      return Array.from({ length: total }, (_unused, index) => index + 1);

    const pages = new Set<number>([1, total, current]);
    for (const offset of [-1, 1]) {
      const target = current + offset;
      if (target > 1 && target < total) pages.add(target);
    }
    if (current <= 3) [2, 3, 4].forEach((item) => pages.add(item));
    if (current >= total - 2)
      [total - 3, total - 2, total - 1].forEach((item) => pages.add(item));

    const ordered = [...pages]
      .filter((item) => item >= 1 && item <= total)
      .sort((left, right) => left - right);
    const result: Array<number | 'gap'> = [];
    let previous = 0;
    for (const item of ordered) {
      if (previous && item - previous > 1) result.push('gap');
      result.push(item);
      previous = item;
    }
    return result;
  });

  const rangeLabel = computed(() => {
    const total = history.value?.total ?? 0;
    if (total === 0) return 'Nenhum commit encontrado';
    const first = (page.value - 1) * PAGE_SIZE + 1;
    const last = Math.min(
      total,
      first + (history.value?.commits.length ?? 0) - 1,
    );
    return `Mostrando ${first} a ${last} de ${total} commits`;
  });

  interface CommitDay {
    key: string;
    label: string;
    commits: GitCommitHistoryEntry[];
  }

  const commitDays = computed<CommitDay[]>(() => {
    const days = new Map<string, CommitDay>();
    for (const commit of history.value?.commits ?? []) {
      const date = new Date(commit.authoredAt);
      const key = Number.isNaN(date.getTime())
        ? 'desconhecida'
        : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!days.has(key)) {
        days.set(key, {
          key,
          label: Number.isNaN(date.getTime())
            ? 'Data desconhecida'
            : date.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
          commits: [],
        });
      }
      days.get(key)!.commits.push(commit);
    }
    return [...days.values()];
  });

  function formatTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '--:--'
      : date.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });
  }

  function formatFullDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Data desconhecida'
      : date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  }

  /** "há 2 horas", "há 1 dia" — a mesma leitura rápida da coluna Tempo. */
  function relativeTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'desconhecido';
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'agora';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `há ${hours} hora${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    if (days < 30) return `há ${days} dia${days === 1 ? '' : 's'}`;
    const months = Math.round(days / 30);
    if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
    const years = Math.round(months / 12);
    return `há ${years} ano${years === 1 ? '' : 's'}`;
  }

  function fileName(filePath: string): string {
    return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
  }

  function directoryName(filePath: string): string {
    const parts = filePath.split('/').filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  }

  function authorInitials(name: string): string {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
        .join('') || '?'
    );
  }

  async function loadWorkspace(): Promise<void> {
    try {
      workspace.value = await fetchProjectGitWorkspace(props.projectId);
    } catch {
      workspace.value = null;
    }
  }

  async function loadHistory(targetPage = page.value): Promise<void> {
    historyController?.abort();
    const controller = new AbortController();
    historyController = controller;
    loading.value = true;
    errorMessage.value = '';

    try {
      const result = await fetchProjectGitCommits(
        props.projectId,
        {
          ...(reference.value ? { ref: reference.value } : {}),
          page: targetPage,
          pageSize: PAGE_SIZE,
          ...(search.value.trim() ? { search: search.value.trim() } : {}),
          ...(author.value ? { author: author.value } : {}),
          kind: kind.value,
        },
        controller.signal,
        scope.value,
      );
      if (controller.signal.aborted) return;
      history.value = result;
      page.value = result.page;
      if (!reference.value) reference.value = result.branch;
    } catch (error) {
      if (controller.signal.aborted) return;
      history.value = null;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o histórico do repositório.';
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  }

  async function openCommit(commit: GitCommitHistoryEntry): Promise<void> {
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    selectedHash.value = commit.hash;
    detail.value = null;
    fileStates.value = [];
    selectedFilePath.value = '';
    detailError.value = '';
    detailLoading.value = true;

    try {
      const result = await fetchProjectGitCommitDetail(
        props.projectId,
        commit.hash,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      detail.value = result;
      fileStates.value = result.files.map((file) =>
        reactive<FileState>({
          file,
          loading: false,
          error: '',
          diff: null,
        }),
      );
      // O diff do primeiro arquivo já aparece: o modal nunca abre vazio.
      const first = fileStates.value[0];
      selectedFilePath.value = first?.file.path ?? '';
      if (first) void loadFileDiff(first);
    } catch (error) {
      if (controller.signal.aborted) return;
      detailError.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os detalhes do commit.';
    } finally {
      if (!controller.signal.aborted) detailLoading.value = false;
    }
  }

  function closeCommit(): void {
    detailController?.abort();
    selectedHash.value = '';
    detail.value = null;
    fileStates.value = [];
    selectedFilePath.value = '';
    detailError.value = '';
  }

  async function loadFileDiff(state: FileState): Promise<void> {
    if (state.diff || state.loading || !detail.value) return;
    state.loading = true;
    state.error = '';
    try {
      state.diff = await fetchProjectGitCommitFileDiff(
        props.projectId,
        detail.value.hash,
        state.file.path,
      );
    } catch (error) {
      state.error =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o diff deste arquivo.';
    } finally {
      state.loading = false;
    }
  }

  const selectedFile = computed(
    () =>
      fileStates.value.find(
        (state) => state.file.path === selectedFilePath.value,
      ) ?? null,
  );

  function selectFile(path: string): void {
    selectedFilePath.value = path;
    const state = fileStates.value.find((item) => item.file.path === path);
    if (state) void loadFileDiff(state);
  }

  async function copyHash(hash: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(hash);
      copiedHash.value = hash;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copiedHash.value = '';
      }, 1_800);
    } catch {
      copiedHash.value = '';
    }
  }

  function goToPage(target: number): void {
    const next = Math.min(totalPages.value, Math.max(1, target));
    if (next === page.value) return;
    void loadHistory(next);
  }

  function applyFilters(): void {
    void loadHistory(1);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && selectedHash.value) closeCommit();
  }

  watch(
    () => props.projectId,
    () => {
      reference.value = '';
      search.value = '';
      author.value = '';
      kind.value = 'all';
      scope.value = 'exclusive';
      page.value = 1;
      closeCommit();
      void loadWorkspace();
      void loadHistory(1);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    historyController?.abort();
    detailController?.abort();
    if (copyTimer) clearTimeout(copyTimer);
  });

  return {
    PAGE_SIZE,
    VIEW_MODE_KEY,
    LIST_WIDTH_KEY,
    DEFAULT_LIST_WIDTH,
    MIN_LIST_WIDTH,
    MAX_LIST_WIDTH,
    RESIZE_KEYBOARD_STEP,
    history,
    workspace,
    reference,
    search,
    author,
    kind,
    scope,
    page,
    loading,
    errorMessage,
    detail,
    detailLoading,
    detailError,
    selectedHash,
    fileStates,
    selectedFilePath,
    viewMode,
    copiedHash,
    listWidth,
    resizingList,
    diffLayoutEl,
    historyController,
    detailController,
    copyTimer,
    statusLabels,
    scopeOptions,
    kindOptions,
    clampListWidth,
    readStoredListWidth,
    persistListWidth,
    startListResize,
    handleResizeKeydown,
    readStoredViewMode,
    selectViewMode,
    branchGroups,
    authorOptions,
    commitBody,
    totalPages,
    pageWindow,
    rangeLabel,
    commitDays,
    formatTime,
    formatFullDate,
    relativeTime,
    fileName,
    directoryName,
    authorInitials,
    loadWorkspace,
    loadHistory,
    openCommit,
    closeCommit,
    loadFileDiff,
    selectedFile,
    selectFile,
    copyHash,
    goToPage,
    applyFilters,
    handleKeydown,
  };
}
