import { h, render } from 'vue';
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

interface GitCommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
}

interface GitCommitHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: GitCommitSummary[];
}

interface GitCommitHistoryResponse {
  history: GitCommitHistoryPage;
}

interface CommitDetailFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

interface CommitDetail extends GitCommitSummary {
  body: string;
  files: CommitDetailFile[];
  additions: number;
  deletions: number;
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

interface CommitDetailResponse {
  detail: CommitDetail;
}

interface SummaryState {
  projectId: string;
  branch: string;
  commits: GitCommitSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  selectedHash: string;
  search: string;
  request: AbortController | undefined;
  historyRequest: AbortController | undefined;
  branchObserver: MutationObserver | undefined;
}

const stateBySection = new WeakMap<HTMLElement, SummaryState>();

function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function mountIcon(host: HTMLElement, component: Parameters<typeof h>[0], className: string): void {
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
  const absolute = Math.abs(seconds);
  if (absolute < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, 'day');
  return formatDate(value);
}

function statusLabel(status: CommitDetailFile['status']): string {
  const labels: Record<CommitDetailFile['status'], string> = {
    added: 'Adicionado',
    modified: 'Modificado',
    deleted: 'Removido',
    renamed: 'Renomeado',
    copied: 'Copiado',
    'type-changed': 'Tipo alterado',
  };
  return labels[status];
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
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

function currentBranchFromSection(section: HTMLElement): string {
  return section
    .querySelector<HTMLElement>('.git-status-grid article:first-child strong')
    ?.textContent
    ?.trim() ?? '';
}

function commitListItem(
  section: HTMLElement,
  commit: GitCommitSummary,
): HTMLButtonElement {
  const state = stateBySection.get(section)!;
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
  button.addEventListener('click', () => {
    void selectCommit(section, commit.hash);
  });
  return button;
}

function renderPagination(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
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

function renderHistoryList(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>('.git-summary-history-count');
  if (!state || !list) return;

  const query = state.search.trim().toLocaleLowerCase('pt-BR');
  const commits = state.commits.filter((commit) => {
    if (!query) return true;
    return [commit.shortHash, commit.subject, commit.authorName, commit.authorEmail]
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
  });

  list.replaceChildren();
  commits.forEach((commit) => list.append(commitListItem(section, commit)));

  if (count) {
    if (query) {
      count.textContent = `${commits.length} resultado${commits.length === 1 ? '' : 's'} nesta página · ${state.total} commits · ${state.branch}`;
    } else if (state.total > 0) {
      const start = ((state.page - 1) * state.pageSize) + 1;
      const end = start + state.commits.length - 1;
      count.textContent = `${start}–${end} de ${state.total} commits · ${state.branch}`;
    } else {
      count.textContent = `0 commits · ${state.branch || 'branch atual'}`;
    }
  }

  if (commits.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'git-summary-history-empty';
    empty.textContent = state.commits.length === 0
      ? 'A branch atual ainda não possui commits.'
      : 'Nenhum commit desta página corresponde à busca.';
    list.append(empty);
  }
  section.querySelector('.git-summary-history-shell')
    ?.classList.toggle('is-empty', state.commits.length === 0);
  renderPagination(section);
}

function setHistoryLoading(section: HTMLElement): void {
  const list = section.querySelector<HTMLElement>('.git-summary-history-list');
  const count = section.querySelector<HTMLElement>('.git-summary-history-count');
  if (!list) return;
  list.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'git-summary-history-empty';
  loading.textContent = 'Carregando commits da branch atual…';
  list.append(loading);
  if (count) count.textContent = 'Atualizando histórico…';
}

function setDetailLoading(section: HTMLElement, commit: GitCommitSummary): void {
  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  if (!panel) return;
  panel.replaceChildren();

  const loading = document.createElement('div');
  loading.className = 'git-summary-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-summary-loading-icon');
  const text = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = commit.subject;
  const span = document.createElement('span');
  span.textContent = 'Carregando alterações do commit…';
  text.append(strong, span);
  loading.append(text);
  panel.append(loading);
}

function renderCommitDetail(section: HTMLElement, detail: CommitDetail): void {
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
  close.title = 'Fechar detalhes e expandir histórico';
  close.setAttribute('aria-label', 'Fechar detalhes do commit');
  mountIcon(close, XMarkIcon, 'git-summary-close-icon');
  close.addEventListener('click', () => closeCommitDetail(section));
  header.append(heading, close);

  const metrics = document.createElement('div');
  metrics.className = 'git-summary-detail-metrics';
  const fileMetric = document.createElement('span');
  fileMetric.innerHTML = `<strong>${detail.files.length}</strong><small>arquivo(s)</small>`;
  const additions = document.createElement('span');
  additions.className = 'is-addition';
  additions.innerHTML = `<strong>+${detail.additions}</strong><small>adições</small>`;
  const deletions = document.createElement('span');
  deletions.className = 'is-deletion';
  deletions.innerHTML = `<strong>−${detail.deletions}</strong><small>remoções</small>`;
  metrics.append(fileMetric, additions, deletions);

  const body = document.createElement('p');
  body.className = 'git-summary-detail-body';
  body.textContent = detail.body && detail.body !== detail.subject
    ? detail.body
    : 'O commit não possui uma descrição adicional.';

  const filesSection = document.createElement('section');
  filesSection.className = 'git-summary-detail-files';
  const filesTitle = document.createElement('header');
  const filesHeading = document.createElement('h4');
  filesHeading.textContent = 'Arquivos alterados';
  filesTitle.append(filesHeading);
  const fileList = document.createElement('ul');
  detail.files.forEach((file) => {
    const item = document.createElement('li');
    const status = document.createElement('span');
    status.className = `is-${file.status}`;
    status.textContent = statusLabel(file.status);
    const path = document.createElement('code');
    path.textContent = file.previousPath
      ? `${file.previousPath} → ${file.path}`
      : file.path;
    const stats = document.createElement('small');
    stats.textContent = file.binary ? 'binário' : `+${file.additions} / −${file.deletions}`;
    item.append(status, path, stats);
    fileList.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-summary-detail-files-empty';
    empty.textContent = 'Nenhum arquivo alterado foi identificado.';
    fileList.append(empty);
  }
  filesSection.append(filesTitle, fileList);

  const patchSection = document.createElement('details');
  patchSection.className = 'git-summary-detail-diff';
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
  patchSection.append(summary, warnings, patchView(detail.patch));

  panel.append(header, metrics, body, filesSection, patchSection);
}

function renderDetailError(section: HTMLElement, message: string): void {
  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  if (!panel) return;
  panel.replaceChildren();

  const error = document.createElement('div');
  error.className = 'git-summary-detail-error';
  const title = document.createElement('strong');
  title.textContent = 'Não foi possível abrir este commit';
  const description = document.createElement('p');
  description.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary-button';
  close.textContent = 'Voltar ao histórico';
  close.addEventListener('click', () => closeCommitDetail(section));
  error.append(title, description, close);
  panel.append(error);
}

async function selectCommit(section: HTMLElement, commitHash: string): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  const commit = state.commits.find((candidate) => candidate.hash === commitHash);
  if (!commit) return;

  state.request?.abort();
  const controller = new AbortController();
  state.request = controller;
  state.selectedHash = commitHash;
  section.querySelector('.git-summary-history-shell')?.classList.add('is-inspecting');
  renderHistoryList(section);
  setDetailLoading(section, commit);

  try {
    const response = await requestJson<CommitDetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits/${encodeURIComponent(commitHash)}`,
      controller.signal,
    );
    if (!controller.signal.aborted && state.selectedHash === commitHash) {
      renderCommitDetail(section, response.detail);
    }
  } catch (error) {
    if (!controller.signal.aborted && state.selectedHash === commitHash) {
      renderDetailError(
        section,
        error instanceof Error ? error.message : 'Falha ao carregar o commit.',
      );
    }
  }
}

function closeCommitDetail(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  state.request?.abort();
  state.request = undefined;
  state.selectedHash = '';
  section.querySelector('.git-summary-history-shell')?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
  renderHistoryList(section);
}

async function loadHistoryPage(
  section: HTMLElement,
  requestedPage: number,
  resetView = false,
): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  state.historyRequest?.abort();
  const controller = new AbortController();
  state.historyRequest = controller;

  if (resetView) {
    state.search = '';
    const input = section.querySelector<HTMLInputElement>('.git-summary-history-search input');
    if (input) input.value = '';
    closeCommitDetail(section);
  }
  setHistoryLoading(section);

  try {
    const query = new URLSearchParams({
      page: String(Math.max(1, requestedPage)),
      pageSize: '10',
    });
    const response = await requestJson<GitCommitHistoryResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits?${query}`,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    state.branch = response.history.branch;
    state.commits = response.history.commits;
    state.page = response.history.page;
    state.pageSize = response.history.pageSize;
    state.total = response.history.total;
    state.totalPages = response.history.totalPages;
    renderHistoryList(section);
  } catch (error) {
    if (controller.signal.aborted) return;
    const list = section.querySelector<HTMLElement>('.git-summary-history-list');
    const count = section.querySelector<HTMLElement>('.git-summary-history-count');
    list?.replaceChildren();
    const message = document.createElement('p');
    message.className = 'git-summary-history-empty is-error';
    message.textContent = error instanceof Error
      ? error.message
      : 'Não foi possível carregar o histórico.';
    list?.append(message);
    if (count) count.textContent = 'Histórico indisponível';
  } finally {
    if (state.historyRequest === controller) state.historyRequest = undefined;
    renderPagination(section);
  }
}

function buildPagination(section: HTMLElement): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'git-summary-history-pagination';

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.dataset.historyPage = 'previous';
  previous.setAttribute('aria-label', 'Página anterior do histórico');
  mountIcon(previous, ChevronLeftIcon, 'git-summary-pagination-icon');
  const previousText = document.createElement('span');
  previousText.textContent = 'Anterior';
  previous.append(previousText);
  previous.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page > 1) void loadHistoryPage(section, state.page - 1, true);
  });

  const label = document.createElement('span');
  label.className = 'git-summary-history-page-label';
  label.textContent = 'Nenhuma página';

  const next = document.createElement('button');
  next.type = 'button';
  next.dataset.historyPage = 'next';
  next.setAttribute('aria-label', 'Próxima página do histórico');
  const nextText = document.createElement('span');
  nextText.textContent = 'Próxima';
  next.append(nextText);
  mountIcon(next, ChevronRightIcon, 'git-summary-pagination-icon');
  next.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page < state.totalPages) {
      void loadHistoryPage(section, state.page + 1, true);
    }
  });

  footer.append(previous, label, next);
  return footer;
}

function watchCurrentBranch(section: HTMLElement): MutationObserver | undefined {
  const target = section.querySelector<HTMLElement>('.git-status-grid article:first-child strong');
  if (!target) return undefined;
  const observer = new MutationObserver(() => {
    const state = stateBySection.get(section);
    if (!state || state.historyRequest) return;
    const branch = currentBranchFromSection(section);
    if (branch && branch !== state.branch) {
      void loadHistoryPage(section, 1, true);
    }
  });
  observer.observe(target, { childList: true, characterData: true, subtree: true });
  return observer;
}

function buildHistory(section: HTMLElement, projectId: string): void {
  const shell = document.createElement('section');
  shell.className = 'git-summary-history-shell';

  const history = document.createElement('div');
  history.className = 'git-summary-history-pane';
  const header = document.createElement('header');
  header.className = 'git-summary-history-header';
  const title = document.createElement('div');
  title.className = 'git-summary-history-title';
  mountIcon(title, ClockIcon, 'git-summary-history-icon');
  const titleCopy = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = 'Histórico da branch atual';
  const count = document.createElement('span');
  count.className = 'git-summary-history-count';
  count.textContent = 'Carregando…';
  titleCopy.append(heading, count);
  title.append(titleCopy);

  const search = document.createElement('label');
  search.className = 'git-summary-history-search';
  mountIcon(search, MagnifyingGlassIcon, 'git-summary-search-icon');
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Buscar nesta página…';
  input.setAttribute('aria-label', 'Buscar nos commits desta página');
  input.addEventListener('input', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.search = input.value;
    renderHistoryList(section);
  });
  search.append(input);
  header.append(title, search);

  const list = document.createElement('div');
  list.className = 'git-summary-history-list';
  const loading = document.createElement('p');
  loading.className = 'git-summary-history-empty';
  loading.textContent = 'Carregando histórico…';
  list.append(loading);
  history.append(header, list, buildPagination(section));

  const detail = document.createElement('aside');
  detail.className = 'git-summary-commit-detail';
  detail.setAttribute('aria-live', 'polite');
  shell.append(history, detail);
  section.append(shell);

  const state: SummaryState = {
    projectId,
    branch: currentBranchFromSection(section),
    commits: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    selectedHash: '',
    search: '',
    request: undefined,
    historyRequest: undefined,
    branchObserver: undefined,
  };
  stateBySection.set(section, state);
  state.branchObserver = watchCurrentBranch(section);
  void loadHistoryPage(section, 1);
}

function enhanceSummary(section: HTMLElement): void {
  if (section.dataset.historyEnhanced === 'true') return;
  const projectId = projectIdFromLocation();
  if (!projectId) return;

  const status = section.querySelector('.git-status-grid');
  const branch = section.querySelector('.git-branch-toolbar');
  if (!status || !branch) return;

  section.dataset.historyEnhanced = 'true';
  section.classList.add('git-summary-history-page');
  Array.from(section.children).forEach((child) => {
    if (child !== status && child !== branch) child.remove();
  });
  buildHistory(section, projectId);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-summary-page')) {
    enhanceSummary(root);
  }
  root.querySelectorAll<HTMLElement>('.git-summary-page').forEach(enhanceSummary);
}

export function installGitSummaryHistoryEnhancer(): void {
  if (typeof document === 'undefined') return;
  scan(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
