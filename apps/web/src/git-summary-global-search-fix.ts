import { h, render } from 'vue';
import {
  ArrowPathIcon,
  ChevronRightIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
}

interface HistoryResponse {
  history: {
    branch: string;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    commits: CommitSummary[];
  };
}

interface CommitFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

interface CommitDetail extends CommitSummary {
  body: string;
  files: CommitFile[];
  additions: number;
  deletions: number;
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

interface DetailResponse {
  detail: CommitDetail;
}

interface OriginalSnapshot {
  listNodes: Node[];
  detailNodes: Node[];
  countText: string;
  pageLabel: string;
  previousDisabled: boolean;
  nextDisabled: boolean;
  inspecting: boolean;
}

interface SummarySearchState {
  projectId: string;
  query: string;
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: CommitSummary[];
  selectedHash: string;
  debounceTimer: number | undefined;
  historyRequest: AbortController | undefined;
  detailRequest: AbortController | undefined;
  snapshot: OriginalSnapshot | undefined;
}

const stateBySection = new WeakMap<HTMLElement, SummarySearchState>();
let summaryFetch: typeof window.fetch | undefined;

function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function mountIcon(
  host: HTMLElement,
  component: Parameters<typeof h>[0],
  className: string,
): void {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function relativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, 'day');
  return formatDate(value);
}

function statusLabel(status: CommitFile['status']): string {
  const labels: Record<CommitFile['status'], string> = {
    added: 'Adicionado',
    modified: 'Modificado',
    deleted: 'Removido',
    renamed: 'Renomeado',
    copied: 'Copiado',
    'type-changed': 'Tipo alterado',
  };
  return labels[status];
}

export function buildSummaryHistorySearchUrl(
  projectId: string,
  search: string,
  page: number,
): string {
  const query = new URLSearchParams({
    page: String(Math.max(1, Math.floor(page))),
    pageSize: '10',
  });
  const normalized = search.trim();
  if (normalized) query.set('search', normalized);
  return `/api/projects/${encodeURIComponent(projectId)}/git/commits?${query.toString()}`;
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const fetcher = summaryFetch ?? window.fetch.bind(window);
  const response = await fetcher(url, {
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  const payload = await response.json().catch(() => null) as T | { message?: string } | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'message' in payload && payload.message
        ? payload.message
        : `A API respondeu com HTTP ${response.status}.`,
    );
  }
  return payload as T;
}

function stateFor(section: HTMLElement): SummarySearchState {
  const existing = stateBySection.get(section);
  if (existing) return existing;
  const state: SummarySearchState = {
    projectId: projectIdFromLocation(),
    query: '',
    branch: '',
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    commits: [],
    selectedHash: '',
    debounceTimer: undefined,
    historyRequest: undefined,
    detailRequest: undefined,
    snapshot: undefined,
  };
  stateBySection.set(section, state);
  return state;
}

function captureOriginal(section: HTMLElement): void {
  const state = stateFor(section);
  if (state.snapshot) return;
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const detail = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  const count = section.querySelector<HTMLElement>('.git-summary-history-count');
  const pageLabel = section.querySelector<HTMLElement>('.git-summary-history-page-label');
  const previous = section.querySelector<HTMLButtonElement>('[data-history-page="previous"]');
  const next = section.querySelector<HTMLButtonElement>('[data-history-page="next"]');
  const shell = section.querySelector<HTMLElement>('.git-summary-history-shell');
  if (!list || !detail) return;
  state.snapshot = {
    listNodes: Array.from(list.childNodes),
    detailNodes: Array.from(detail.childNodes),
    countText: count?.textContent ?? '',
    pageLabel: pageLabel?.textContent ?? '',
    previousDisabled: previous?.disabled ?? true,
    nextDisabled: next?.disabled ?? true,
    inspecting: shell?.classList.contains('is-inspecting') ?? false,
  };
}

function restoreOriginal(section: HTMLElement): void {
  const state = stateFor(section);
  state.historyRequest?.abort();
  state.detailRequest?.abort();
  state.historyRequest = undefined;
  state.detailRequest = undefined;
  state.selectedHash = '';
  const snapshot = state.snapshot;
  state.snapshot = undefined;
  if (!snapshot) return;

  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const detail = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  const count = section.querySelector<HTMLElement>('.git-summary-history-count');
  const pageLabel = section.querySelector<HTMLElement>('.git-summary-history-page-label');
  const previous = section.querySelector<HTMLButtonElement>('[data-history-page="previous"]');
  const next = section.querySelector<HTMLButtonElement>('[data-history-page="next"]');
  const shell = section.querySelector<HTMLElement>('.git-summary-history-shell');

  list?.replaceChildren(...snapshot.listNodes);
  detail?.replaceChildren(...snapshot.detailNodes);
  if (count) count.textContent = snapshot.countText;
  if (pageLabel) pageLabel.textContent = snapshot.pageLabel;
  if (previous) previous.disabled = snapshot.previousDisabled;
  if (next) next.disabled = snapshot.nextDisabled;
  shell?.classList.toggle('is-inspecting', snapshot.inspecting);
}

function setPagination(section: HTMLElement): void {
  const state = stateFor(section);
  const previous = section.querySelector<HTMLButtonElement>('[data-history-page="previous"]');
  const next = section.querySelector<HTMLButtonElement>('[data-history-page="next"]');
  const label = section.querySelector<HTMLElement>('.git-summary-history-page-label');
  if (previous) previous.disabled = state.page <= 1 || state.totalPages <= 1;
  if (next) next.disabled = state.totalPages <= 1 || state.page >= state.totalPages;
  if (label) {
    label.textContent = state.totalPages > 0
      ? `Página ${state.page} de ${state.totalPages}`
      : 'Nenhuma página';
  }
}

function resultRow(section: HTMLElement, commit: CommitSummary): HTMLButtonElement {
  const state = stateFor(section);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-history-commit-row';
  button.dataset.commitHash = commit.hash;
  button.classList.toggle('active', state.selectedHash === commit.hash);

  const rail = document.createElement('span');
  rail.className = 'git-history-commit-rail';
  rail.append(document.createElement('i'));

  const content = document.createElement('span');
  content.className = 'git-history-commit-copy';
  const top = document.createElement('span');
  top.className = 'git-history-commit-topline';
  const hash = document.createElement('code');
  hash.textContent = commit.shortHash;
  const date = document.createElement('time');
  date.dateTime = commit.authoredAt;
  date.textContent = relativeDate(commit.authoredAt);
  date.title = formatDate(commit.authoredAt);
  top.append(hash, date);
  const subject = document.createElement('strong');
  subject.textContent = commit.subject;
  const author = document.createElement('small');
  author.textContent = commit.authorName;
  content.append(top, subject, author);

  mountIcon(button, ChevronRightIcon, 'git-history-row-chevron');
  button.prepend(rail, content);
  button.addEventListener('click', () => void selectResult(section, commit));
  return button;
}

function renderResults(section: HTMLElement): void {
  const state = stateFor(section);
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>('.git-summary-history-count');
  if (!list) return;
  list.replaceChildren();
  state.commits.forEach((commit) => list.append(resultRow(section, commit)));

  if (count) {
    if (state.total > 0) {
      const start = ((state.page - 1) * state.pageSize) + 1;
      const end = start + state.commits.length - 1;
      count.textContent = `${start}–${end} de ${state.total} resultado${state.total === 1 ? '' : 's'} em todo o histórico · ${state.branch}`;
    } else {
      count.textContent = `0 resultados em todo o histórico · ${state.branch || 'branch atual'}`;
    }
  }

  if (state.commits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'git-summary-history-empty';
    empty.textContent = 'Nenhum commit do histórico corresponde à busca.';
    list.append(empty);
  }
  setPagination(section);
}

function setSearchLoading(section: HTMLElement): void {
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>('.git-summary-history-count');
  if (!list) return;
  list.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'git-summary-history-empty';
  loading.textContent = 'Buscando em todo o histórico da branch…';
  list.append(loading);
  if (count) count.textContent = 'Buscando commits…';
}

function closeSearchDetail(section: HTMLElement): void {
  const state = stateFor(section);
  state.detailRequest?.abort();
  state.detailRequest = undefined;
  state.selectedHash = '';
  section.querySelector('.git-summary-history-shell')?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
  renderResults(section);
}

function patchView(patch: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'git-commit-detail-patch';
  if (!patch.trim()) {
    pre.textContent = 'Este commit não possui um patch textual para exibir.';
    return pre;
  }
  patch.split('\n').forEach((line) => {
    const row = document.createElement('span');
    row.className = line.startsWith('+++') || line.startsWith('---')
      ? 'is-file'
      : line.startsWith('+')
        ? 'is-addition'
        : line.startsWith('-')
          ? 'is-deletion'
          : line.startsWith('@@')
            ? 'is-hunk'
            : line.startsWith('diff ') || line.startsWith('index ')
              ? 'is-meta'
              : '';
    row.textContent = `${line}\n`;
    pre.append(row);
  });
  return pre;
}

function metric(value: string, label: string, className = ''): HTMLElement {
  const item = document.createElement('span');
  if (className) item.className = className;
  const strong = document.createElement('strong');
  strong.textContent = value;
  const small = document.createElement('small');
  small.textContent = label;
  item.append(strong, small);
  return item;
}

function renderDetail(section: HTMLElement, detail: CommitDetail): void {
  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  if (!panel) return;
  panel.replaceChildren();

  const header = document.createElement('header');
  header.className = 'git-summary-detail-header';
  const heading = document.createElement('div');
  heading.className = 'git-summary-detail-heading';
  mountIcon(heading, DocumentTextIcon, 'git-summary-detail-icon');
  const copy = document.createElement('div');
  const hash = document.createElement('code');
  hash.textContent = detail.shortHash;
  const title = document.createElement('h3');
  title.textContent = detail.subject;
  const metadata = document.createElement('p');
  metadata.textContent = `${detail.authorName} · ${formatDate(detail.authoredAt)}`;
  copy.append(hash, title, metadata);
  heading.append(copy);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'git-summary-detail-close';
  close.title = 'Fechar detalhes e voltar aos resultados';
  close.setAttribute('aria-label', 'Fechar detalhes do commit');
  mountIcon(close, XMarkIcon, 'git-summary-close-icon');
  close.addEventListener('click', () => closeSearchDetail(section));
  header.append(heading, close);

  const metrics = document.createElement('div');
  metrics.className = 'git-summary-detail-metrics';
  metrics.append(
    metric(String(detail.files.length), 'arquivo(s)'),
    metric(`+${detail.additions}`, 'adições', 'is-addition'),
    metric(`−${detail.deletions}`, 'remoções', 'is-deletion'),
  );

  const body = document.createElement('p');
  body.className = 'git-summary-detail-body';
  body.textContent = detail.body && detail.body !== detail.subject
    ? detail.body
    : 'O commit não possui uma descrição adicional.';

  const filesSection = document.createElement('section');
  filesSection.className = 'git-summary-detail-files';
  const filesHeader = document.createElement('header');
  const filesHeading = document.createElement('h4');
  filesHeading.textContent = 'Arquivos alterados';
  filesHeader.append(filesHeading);
  const files = document.createElement('ul');
  detail.files.forEach((file) => {
    const item = document.createElement('li');
    const status = document.createElement('span');
    status.className = `is-${file.status}`;
    status.textContent = statusLabel(file.status);
    const path = document.createElement('code');
    path.textContent = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
    const stats = document.createElement('small');
    stats.textContent = file.binary ? 'binário' : `+${file.additions} / −${file.deletions}`;
    item.append(status, path, stats);
    files.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-summary-detail-files-empty';
    empty.textContent = 'Nenhum arquivo alterado foi identificado.';
    files.append(empty);
  }
  filesSection.append(filesHeader, files);

  const diff = document.createElement('details');
  diff.className = 'git-summary-detail-diff';
  const summary = document.createElement('summary');
  mountIcon(summary, CodeBracketSquareIcon, 'git-summary-diff-icon');
  const summaryText = document.createElement('span');
  summaryText.textContent = 'Ver diff completo';
  summary.append(summaryText);
  const warnings = document.createElement('div');
  warnings.className = 'git-summary-detail-warnings';
  if (detail.masked) {
    const warning = document.createElement('p');
    warning.textContent = `${detail.redactionCount} possível(is) segredo(s) foram mascarados.`;
    warnings.append(warning);
  }
  if (detail.truncated) {
    const warning = document.createElement('p');
    warning.textContent = 'O diff foi truncado para manter a página responsiva.';
    warnings.append(warning);
  }
  diff.append(summary, warnings, patchView(detail.patch));
  panel.append(header, metrics, body, filesSection, diff);
}

async function selectResult(section: HTMLElement, commit: CommitSummary): Promise<void> {
  const state = stateFor(section);
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.detailRequest = controller;
  state.selectedHash = commit.hash;
  section.querySelector('.git-summary-history-shell')?.classList.add('is-inspecting');
  renderResults(section);

  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  panel?.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-summary-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-summary-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = commit.subject;
  const description = document.createElement('span');
  description.textContent = 'Carregando alterações do commit…';
  copy.append(title, description);
  loading.append(copy);
  panel?.append(loading);

  try {
    const response = await requestJson<DetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits/${encodeURIComponent(commit.hash)}`,
      controller.signal,
    );
    if (!controller.signal.aborted && state.selectedHash === commit.hash) {
      renderDetail(section, response.detail);
    }
  } catch (error) {
    if (controller.signal.aborted || state.selectedHash !== commit.hash || !panel) return;
    panel.replaceChildren();
    const message = document.createElement('div');
    message.className = 'git-summary-detail-error';
    const title = document.createElement('strong');
    title.textContent = 'Não foi possível abrir este commit';
    const description = document.createElement('p');
    description.textContent = error instanceof Error ? error.message : 'Falha ao carregar o commit.';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'secondary-button';
    back.textContent = 'Voltar aos resultados';
    back.addEventListener('click', () => closeSearchDetail(section));
    message.append(title, description, back);
    panel.append(message);
  }
}

async function loadSearchPage(section: HTMLElement, requestedPage: number): Promise<void> {
  const state = stateFor(section);
  if (!state.query.trim() || !state.projectId) return;
  captureOriginal(section);
  state.historyRequest?.abort();
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.historyRequest = controller;
  state.selectedHash = '';
  section.querySelector('.git-summary-history-shell')?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
  setSearchLoading(section);

  try {
    const response = await requestJson<HistoryResponse>(
      buildSummaryHistorySearchUrl(state.projectId, state.query, requestedPage),
      controller.signal,
    );
    if (controller.signal.aborted) return;
    state.branch = response.history.branch;
    state.page = response.history.page;
    state.pageSize = response.history.pageSize;
    state.total = response.history.total;
    state.totalPages = response.history.totalPages;
    state.commits = response.history.commits;
    renderResults(section);
  } catch (error) {
    if (controller.signal.aborted) return;
    const list = section.querySelector<HTMLElement>('.git-summary-history-list');
    const count = section.querySelector<HTMLElement>('.git-summary-history-count');
    list?.replaceChildren();
    const message = document.createElement('p');
    message.className = 'git-summary-history-empty is-error';
    message.textContent = error instanceof Error ? error.message : 'Não foi possível buscar o histórico.';
    list?.append(message);
    if (count) count.textContent = 'Busca indisponível';
    state.totalPages = 0;
    setPagination(section);
  } finally {
    if (state.historyRequest === controller) state.historyRequest = undefined;
  }
}

function resetForBranchChange(section: HTMLElement, input: HTMLInputElement): void {
  const state = stateFor(section);
  if (!state.query && !state.snapshot) return;
  if (state.debounceTimer) window.clearTimeout(state.debounceTimer);
  state.historyRequest?.abort();
  state.detailRequest?.abort();
  state.query = '';
  state.snapshot = undefined;
  state.selectedHash = '';
  input.value = '';
  section.querySelector('.git-summary-history-shell')?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
}

function enhanceSection(section: HTMLElement): void {
  if (section.dataset.summaryGlobalSearch === 'true') return;
  const input = section.querySelector<HTMLInputElement>('.git-summary-history-search input');
  const pagination = section.querySelector<HTMLElement>('.git-summary-history-pagination');
  if (!input || !pagination) return;
  section.dataset.summaryGlobalSearch = 'true';
  const state = stateFor(section);
  input.placeholder = 'Buscar em todo o histórico…';
  input.setAttribute('aria-label', 'Buscar em todos os commits da branch atual');

  input.addEventListener('input', (event) => {
    event.stopImmediatePropagation();
    state.query = input.value;
    if (state.debounceTimer) window.clearTimeout(state.debounceTimer);
    if (!state.query.trim()) {
      restoreOriginal(section);
      return;
    }
    captureOriginal(section);
    state.debounceTimer = window.setTimeout(() => {
      state.debounceTimer = undefined;
      void loadSearchPage(section, 1);
    }, 300);
  }, { capture: true });

  pagination.addEventListener('click', (event) => {
    if (!state.query.trim()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-history-page]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.dataset.historyPage === 'previous' && state.page > 1) {
      void loadSearchPage(section, state.page - 1);
    }
    if (button.dataset.historyPage === 'next' && state.page < state.totalPages) {
      void loadSearchPage(section, state.page + 1);
    }
  }, true);

  const branch = section.querySelector<HTMLElement>('.git-status-grid article:first-child strong');
  if (branch) {
    const observer = new MutationObserver(() => resetForBranchChange(section, input));
    observer.observe(branch, { childList: true, characterData: true, subtree: true });
  }
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-summary-history-shell')) {
    const section = root.closest<HTMLElement>('.git-summary-page');
    if (section) enhanceSection(section);
  }
  root.querySelectorAll<HTMLElement>('.git-summary-history-shell').forEach((shell) => {
    const section = shell.closest<HTMLElement>('.git-summary-page');
    if (section) enhanceSection(section);
  });
}

export function installGitSummaryGlobalSearchFix(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitSummaryGlobalSearch === 'true') return;
  document.documentElement.dataset.gitSummaryGlobalSearch = 'true';
  summaryFetch = window.fetch.bind(window);
  scan();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
