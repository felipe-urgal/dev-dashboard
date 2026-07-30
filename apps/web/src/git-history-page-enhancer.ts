import { h, render } from 'vue';
import {
  ArrowPathIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  TagIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

interface GitBranch {
  name: string;
  shortName: string;
  kind: 'local' | 'remote';
  current: boolean;
  remote?: string;
}

interface GitWorkspaceResponse {
  workspace: {
    branches: GitBranch[];
  };
}

export interface GitHistoryCommit {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  parentCount: number;
}

interface GitHistoryPage {
  branch: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  commits: GitHistoryCommit[];
}

interface GitHistoryResponse {
  history: GitHistoryPage;
}

interface CommitFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

interface CommitDetail extends Omit<GitHistoryCommit, 'parentCount'> {
  body: string;
  files: CommitFile[];
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

export type HistoryCommitKind = 'all' | 'merge' | 'regular';

interface HistoryPageState {
  projectId: string;
  reference: string;
  resolvedReference: string;
  branches: GitBranch[];
  commits: GitHistoryCommit[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  search: string;
  author: string;
  kind: HistoryCommitKind;
  selectedHash: string;
  copiedHash: string;
  historyRequest: AbortController | undefined;
  detailRequest: AbortController | undefined;
}

const stateBySection = new WeakMap<HTMLElement, HistoryPageState>();

const HISTORY_LIST_WIDTH_KEY = 'dev-dashboard-git-history-list-width';
const DEFAULT_HISTORY_LIST_WIDTH = 30;
const MIN_HISTORY_LIST_WIDTH = 22;
const MAX_HISTORY_LIST_WIDTH = 62;

export function clampHistoryListWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_HISTORY_LIST_WIDTH;
  return Math.min(MAX_HISTORY_LIST_WIDTH, Math.max(MIN_HISTORY_LIST_WIDTH, value));
}

function readHistoryListWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(HISTORY_LIST_WIDTH_KEY));
    return stored > 0 ? clampHistoryListWidth(stored) : DEFAULT_HISTORY_LIST_WIDTH;
  } catch {
    return DEFAULT_HISTORY_LIST_WIDTH;
  }
}

function persistHistoryListWidth(value: number): void {
  try {
    window.localStorage.setItem(HISTORY_LIST_WIDTH_KEY, String(value));
  } catch {
    // Preferência visual opcional.
  }
}

function applyHistoryListWidth(layout: HTMLElement, value: number): number {
  const width = clampHistoryListWidth(value);
  layout.style.setProperty('--git-history-list-width', `${width}%`);
  const separator = layout.querySelector<HTMLElement>('.git-history-page-resizer');
  separator?.setAttribute('aria-valuenow', String(Math.round(width)));
  return width;
}

function buildHistoryResizer(layout: HTMLElement): HTMLButtonElement {
  const separator = document.createElement('button');
  separator.type = 'button';
  separator.className = 'git-history-page-resizer';
  separator.setAttribute('role', 'separator');
  separator.setAttribute('aria-label', 'Redimensionar lista de commits e detalhes');
  separator.setAttribute('aria-orientation', 'vertical');
  separator.setAttribute('aria-valuemin', String(MIN_HISTORY_LIST_WIDTH));
  separator.setAttribute('aria-valuemax', String(MAX_HISTORY_LIST_WIDTH));

  const updateFromPointer = (event: PointerEvent): void => {
    const bounds = layout.getBoundingClientRect();
    if (bounds.width <= 0) return;
    applyHistoryListWidth(layout, ((event.clientX - bounds.left) / bounds.width) * 100);
  };

  const finishResize = (event: PointerEvent): void => {
    if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId);
    separator.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-resizing-git-history');
    persistHistoryListWidth(Number.parseFloat(
      layout.style.getPropertyValue('--git-history-list-width'),
    ));
  };

  separator.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || window.matchMedia('(max-width: 820px)').matches) return;
    event.preventDefault();
    separator.setPointerCapture(event.pointerId);
    separator.classList.add('is-dragging');
    document.documentElement.classList.add('is-resizing-git-history');
    updateFromPointer(event);
  });
  separator.addEventListener('pointermove', (event) => {
    if (!separator.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event);
  });
  separator.addEventListener('pointerup', finishResize);
  separator.addEventListener('pointercancel', finishResize);
  separator.addEventListener('keydown', (event) => {
    const current = Number.parseFloat(
      layout.style.getPropertyValue('--git-history-list-width'),
    ) || DEFAULT_HISTORY_LIST_WIDTH;
    let next = current;
    if (event.key === 'ArrowLeft') next = current - 2;
    else if (event.key === 'ArrowRight') next = current + 2;
    else if (event.key === 'Home') next = MIN_HISTORY_LIST_WIDTH;
    else if (event.key === 'End') next = MAX_HISTORY_LIST_WIDTH;
    else return;
    event.preventDefault();
    persistHistoryListWidth(applyHistoryListWidth(layout, next));
  });

  return separator;
}

function projectIdFromLocation(): string {
  const match = window.location.pathname.match(/\/projects\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function mountIcon(
  host: HTMLElement,
  component: Parameters<typeof h>[0],
  className: string,
): HTMLElement {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
  return iconHost;
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

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

export function filterHistoryCommits(
  commits: readonly GitHistoryCommit[],
  search: string,
  author: string,
  kind: HistoryCommitKind,
): GitHistoryCommit[] {
  const query = normalized(search);
  return commits.filter((commit) => {
    if (author && commit.authorEmail !== author) return false;
    if (kind === 'merge' && commit.parentCount < 2) return false;
    if (kind === 'regular' && commit.parentCount >= 2) return false;
    if (!query) return true;
    return [commit.hash, commit.shortHash, commit.subject, commit.authorName, commit.authorEmail]
      .some((value) => normalized(value).includes(query));
  });
}

export function uniqueHistoryAuthors(
  commits: readonly GitHistoryCommit[],
): Array<{ email: string; name: string }> {
  const authors = new Map<string, string>();
  commits.forEach((commit) => {
    if (!authors.has(commit.authorEmail)) authors.set(commit.authorEmail, commit.authorName);
  });
  return [...authors.entries()]
    .map(([email, name]) => ({ email, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function dayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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

function currentReference(branches: readonly GitBranch[]): string {
  return branches.find((branch) => branch.kind === 'local' && branch.current)?.name ?? 'HEAD';
}

function renderReferenceOptions(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const select = section.querySelector<HTMLSelectElement>('[data-history-control="reference"]');
  if (!state || !select) return;

  select.replaceChildren();
  const groups: Array<{ label: string; branches: GitBranch[] }> = [
    {
      label: 'Branches locais',
      branches: state.branches.filter((branch) => branch.kind === 'local'),
    },
    {
      label: 'Origin',
      branches: state.branches.filter((branch) => branch.kind === 'remote' && branch.remote === 'origin'),
    },
    {
      label: 'Upstream',
      branches: state.branches.filter((branch) => branch.kind === 'remote' && branch.remote === 'upstream'),
    },
    {
      label: 'Outros remotos',
      branches: state.branches.filter((branch) =>
        branch.kind === 'remote' && branch.remote !== 'origin' && branch.remote !== 'upstream'),
    },
  ];

  groups.forEach((group) => {
    if (group.branches.length === 0) return;
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.branches.forEach((branch) => {
      const option = document.createElement('option');
      option.value = branch.name;
      option.textContent = branch.current ? `✓ ${branch.name}` : branch.name;
      optgroup.append(option);
    });
    select.append(optgroup);
  });

  if (![...select.options].some((option) => option.value === state.reference)) {
    const option = document.createElement('option');
    option.value = state.reference;
    option.textContent = state.reference;
    select.prepend(option);
  }
  select.value = state.reference;
}

function renderAuthorOptions(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const select = section.querySelector<HTMLSelectElement>('[data-history-control="author"]');
  if (!state || !select) return;
  const previous = state.author;
  select.replaceChildren();
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Todos os autores';
  select.append(all);
  uniqueHistoryAuthors(state.commits).forEach((author) => {
    const option = document.createElement('option');
    option.value = author.email;
    option.textContent = author.name;
    option.title = author.email;
    select.append(option);
  });
  state.author = [...select.options].some((option) => option.value === previous) ? previous : '';
  select.value = state.author;
}

function renderMetrics(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  const mergeCount = state.commits.filter((commit) => commit.parentCount >= 2).length;
  const authorCount = uniqueHistoryAuthors(state.commits).length;
  const first = state.commits[0];
  const last = state.commits.at(-1);
  const range = state.total > 0
    ? `${((state.page - 1) * state.pageSize) + 1}–${((state.page - 1) * state.pageSize) + state.commits.length}`
    : '0';

  const values: Record<string, { value: string; detail: string }> = {
    reference: {
      value: state.resolvedReference || state.reference,
      detail: 'referência consultada',
    },
    commits: {
      value: String(state.total),
      detail: `${range} exibidos nesta página`,
    },
    authors: {
      value: String(authorCount),
      detail: `${mergeCount} merge${mergeCount === 1 ? '' : 's'} nesta página`,
    },
    period: {
      value: first && last ? `${relativeDate(first.authoredAt)} → ${relativeDate(last.authoredAt)}` : 'Sem período',
      detail: 'intervalo da página atual',
    },
  };

  Object.entries(values).forEach(([key, content]) => {
    const card = section.querySelector<HTMLElement>(`[data-history-metric="${key}"]`);
    const strong = card?.querySelector('strong');
    const small = card?.querySelector('small');
    if (strong) strong.textContent = content.value;
    if (small) small.textContent = content.detail;
  });
}

function resetFilters(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  state.search = '';
  state.author = '';
  state.kind = 'all';
  const search = section.querySelector<HTMLInputElement>('[data-history-control="search"]');
  const author = section.querySelector<HTMLSelectElement>('[data-history-control="author"]');
  const kind = section.querySelector<HTMLSelectElement>('[data-history-control="kind"]');
  if (search) search.value = '';
  if (author) author.value = '';
  if (kind) kind.value = 'all';
}

function commitRow(section: HTMLElement, commit: GitHistoryCommit): HTMLButtonElement {
  const state = stateBySection.get(section)!;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-history-page-row';
  button.dataset.commitHash = commit.hash;
  button.classList.toggle('active', state.selectedHash === commit.hash);

  const rail = document.createElement('span');
  rail.className = 'git-history-page-rail';
  rail.append(document.createElement('i'));

  const copy = document.createElement('span');
  copy.className = 'git-history-page-row-copy';
  const top = document.createElement('span');
  top.className = 'git-history-page-row-top';
  const hash = document.createElement('code');
  hash.textContent = commit.shortHash;
  const time = document.createElement('time');
  time.dateTime = commit.authoredAt;
  time.textContent = relativeDate(commit.authoredAt);
  time.title = formatDate(commit.authoredAt);
  top.append(hash, time);

  const subject = document.createElement('strong');
  subject.textContent = commit.subject;
  const metadata = document.createElement('span');
  metadata.className = 'git-history-page-row-meta';
  const author = document.createElement('small');
  author.textContent = commit.authorName;
  author.title = commit.authorEmail;
  metadata.append(author);
  if (commit.parentCount >= 2) {
    const merge = document.createElement('em');
    merge.textContent = 'Merge';
    metadata.append(merge);
  }
  copy.append(top, subject, metadata);

  mountIcon(button, ChevronRightIcon, 'git-history-page-chevron');
  button.prepend(rail, copy);
  button.addEventListener('click', () => void selectCommit(section, commit.hash));
  return button;
}

function filteredCommits(state: HistoryPageState): GitHistoryCommit[] {
  return filterHistoryCommits(state.commits, state.search, state.author, state.kind);
}

function renderList(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const list = section.querySelector<HTMLElement>('.git-history-page-list');
  const count = section.querySelector<HTMLElement>('.git-history-page-filter-count');
  if (!state || !list) return;
  const commits = filteredCommits(state);

  list.replaceChildren();
  let previousDay = '';
  commits.forEach((commit) => {
    const currentDay = dayKey(commit.authoredAt);
    if (currentDay !== previousDay) {
      const separator = document.createElement('div');
      separator.className = 'git-history-page-day';
      separator.textContent = formatDay(commit.authoredAt);
      list.append(separator);
      previousDay = currentDay;
    }
    list.append(commitRow(section, commit));
  });

  if (count) {
    count.textContent = commits.length === state.commits.length
      ? `${commits.length} commits nesta página`
      : `${commits.length} de ${state.commits.length} commits nesta página`;
  }

  if (commits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'git-history-page-empty';
    mountIcon(empty, MagnifyingGlassIcon, 'git-history-page-empty-icon');
    const title = document.createElement('strong');
    title.textContent = state.commits.length === 0
      ? 'Nenhum commit encontrado'
      : 'Nenhum commit corresponde aos filtros';
    const description = document.createElement('p');
    description.textContent = state.commits.length === 0
      ? 'Esta referência ainda não possui commits.'
      : 'Ajuste a busca, o autor ou o tipo de commit.';
    empty.append(title, description);
    list.append(empty);
  }

  list.querySelector<HTMLButtonElement>('.git-history-page-row')?.setAttribute('tabindex', '0');
  renderPagination(section);
}

function setHistoryLoading(section: HTMLElement): void {
  const list = section.querySelector<HTMLElement>('.git-history-page-list');
  if (!list) return;
  list.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-history-page-loading';
  mountIcon(loading, ArrowPathIcon, 'git-history-page-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Carregando histórico';
  const description = document.createElement('span');
  description.textContent = 'Consultando commits e autores da referência…';
  copy.append(title, description);
  loading.append(copy);
  list.append(loading);
}

function renderPagination(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  const previous = section.querySelector<HTMLButtonElement>('[data-history-page="previous"]');
  const next = section.querySelector<HTMLButtonElement>('[data-history-page="next"]');
  const label = section.querySelector<HTMLElement>('.git-history-page-pagination-label');
  if (previous) previous.disabled = state.page <= 1 || state.totalPages <= 1;
  if (next) next.disabled = state.totalPages <= 1 || state.page >= state.totalPages;
  if (label) label.textContent = state.totalPages > 0
    ? `Página ${state.page} de ${state.totalPages}`
    : 'Nenhuma página';
}

function closeDetail(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  state.detailRequest?.abort();
  state.detailRequest = undefined;
  state.selectedHash = '';
  state.copiedHash = '';
  section.querySelector('.git-history-page-layout')?.classList.remove('is-inspecting');
  section.querySelector('.git-history-page-detail')?.replaceChildren();
  renderList(section);
}

function detailLoading(section: HTMLElement, commit: GitHistoryCommit): void {
  const host = section.querySelector<HTMLElement>('.git-history-page-detail');
  if (!host) return;
  host.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-history-page-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-history-page-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = commit.subject;
  const description = document.createElement('span');
  description.textContent = 'Carregando arquivos e diff…';
  copy.append(title, description);
  loading.append(copy);
  host.append(loading);
}

function patchView(patch: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'git-history-page-patch';
  // Preserva o texto bruto do patch num atributo, imune a mutações visuais de outros
  // enhancers (destaque de sintaxe, limpeza de cabeçalhos redundantes) que reescrevem o
  // innerHTML do <pre> depois — git-inline-file-diff-enhancer.ts depende desse texto
  // intacto para separar o patch combinado por arquivo.
  pre.dataset.rawPatch = patch;
  if (!patch.trim()) {
    pre.textContent = 'Este commit não possui diff textual para exibir.';
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

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function renderDetail(section: HTMLElement, detail: CommitDetail): void {
  const state = stateBySection.get(section);
  const host = section.querySelector<HTMLElement>('.git-history-page-detail');
  if (!state || !host) return;
  host.replaceChildren();

  const header = document.createElement('header');
  header.className = 'git-history-page-detail-header';
  const heading = document.createElement('div');
  heading.className = 'git-history-page-detail-heading';
  mountIcon(heading, DocumentTextIcon, 'git-history-page-detail-icon');
  const copy = document.createElement('div');
  const hashLine = document.createElement('span');
  hashLine.className = 'git-history-page-detail-hash';
  const hash = document.createElement('code');
  hash.textContent = detail.shortHash;
  const copyHash = document.createElement('button');
  copyHash.type = 'button';
  copyHash.title = 'Copiar hash completo';
  copyHash.setAttribute('aria-label', 'Copiar hash completo do commit');
  mountIcon(copyHash, ClipboardDocumentIcon, 'git-history-page-copy-icon');
  copyHash.addEventListener('click', async () => {
    await copyText(detail.hash);
    state.copiedHash = detail.hash;
    copyHash.replaceChildren();
    mountIcon(copyHash, CheckIcon, 'git-history-page-copy-icon');
    copyHash.classList.add('is-copied');
    window.setTimeout(() => {
      if (state.copiedHash !== detail.hash) return;
      state.copiedHash = '';
      copyHash.replaceChildren();
      mountIcon(copyHash, ClipboardDocumentIcon, 'git-history-page-copy-icon');
      copyHash.classList.remove('is-copied');
    }, 1_800);
  });
  hashLine.append(hash, copyHash);
  const title = document.createElement('h3');
  title.textContent = detail.subject;
  const metadata = document.createElement('p');
  metadata.textContent = `${detail.authorName} <${detail.authorEmail}> · ${formatDate(detail.authoredAt)}`;
  copy.append(hashLine, title, metadata);
  heading.append(copy);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'git-history-page-detail-close';
  close.title = 'Fechar detalhes';
  close.setAttribute('aria-label', 'Fechar detalhes do commit');
  mountIcon(close, XMarkIcon, 'git-history-page-close-icon');
  close.addEventListener('click', () => closeDetail(section));
  header.append(heading, close);

  const metrics = document.createElement('div');
  metrics.className = 'git-history-page-detail-metrics';
  [
    [String(detail.files.length), 'arquivos', ''],
    [`+${detail.additions}`, 'adições', 'is-addition'],
    [`−${detail.deletions}`, 'remoções', 'is-deletion'],
  ].forEach(([value, label, className]) => {
    const metric = document.createElement('span');
    if (className) metric.className = className;
    const strong = document.createElement('strong');
    strong.textContent = value ?? '';
    const small = document.createElement('small');
    small.textContent = label ?? '';
    metric.append(strong, small);
    metrics.append(metric);
  });

  const body = document.createElement('p');
  body.className = 'git-history-page-detail-body';
  body.textContent = detail.body && detail.body !== detail.subject
    ? detail.body
    : 'O commit não possui uma descrição adicional.';

  const files = document.createElement('section');
  files.className = 'git-history-page-detail-files';
  const filesHeader = document.createElement('header');
  const filesTitle = document.createElement('h4');
  filesTitle.textContent = 'Arquivos alterados';
  filesHeader.append(filesTitle);
  const fileList = document.createElement('ul');
  detail.files.forEach((file) => {
    const item = document.createElement('li');
    const status = document.createElement('span');
    status.className = `is-${file.status}`;
    status.textContent = statusLabel(file.status);
    const filePath = document.createElement('code');
    filePath.textContent = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
    const stats = document.createElement('small');
    stats.textContent = file.binary ? 'binário' : `+${file.additions} / −${file.deletions}`;
    item.append(status, filePath, stats);
    fileList.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-history-page-files-empty';
    empty.textContent = 'Nenhum arquivo alterado foi identificado.';
    fileList.append(empty);
  }
  files.append(filesHeader, fileList);

  const diff = document.createElement('details');
  diff.className = 'git-history-page-diff';
  const summary = document.createElement('summary');
  mountIcon(summary, CodeBracketSquareIcon, 'git-history-page-diff-icon');
  const summaryText = document.createElement('span');
  summaryText.textContent = 'Ver diff completo';
  summary.append(summaryText);
  const warnings = document.createElement('div');
  warnings.className = 'git-history-page-warnings';
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
  host.append(header, metrics, body, files, diff);
}

function renderDetailError(section: HTMLElement, message: string): void {
  const host = section.querySelector<HTMLElement>('.git-history-page-detail');
  if (!host) return;
  host.replaceChildren();
  const error = document.createElement('div');
  error.className = 'git-history-page-detail-error';
  const title = document.createElement('strong');
  title.textContent = 'Não foi possível abrir este commit';
  const description = document.createElement('p');
  description.textContent = message;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'secondary-button';
  back.textContent = 'Voltar ao histórico';
  back.addEventListener('click', () => closeDetail(section));
  error.append(title, description, back);
  host.append(error);
}

async function selectCommit(section: HTMLElement, hash: string): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  const commit = state.commits.find((candidate) => candidate.hash === hash);
  if (!commit) return;
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.detailRequest = controller;
  state.selectedHash = hash;
  section.querySelector('.git-history-page-layout')?.classList.add('is-inspecting');
  renderList(section);
  detailLoading(section, commit);

  try {
    const response = await requestJson<CommitDetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits/${encodeURIComponent(hash)}`,
      controller.signal,
    );
    if (!controller.signal.aborted && state.selectedHash === hash) {
      renderDetail(section, response.detail);
    }
  } catch (error) {
    if (!controller.signal.aborted && state.selectedHash === hash) {
      renderDetailError(
        section,
        error instanceof Error ? error.message : 'Falha ao carregar o commit.',
      );
    }
  }
}

async function loadHistory(
  section: HTMLElement,
  requestedPage: number,
  reset = false,
): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  state.historyRequest?.abort();
  const controller = new AbortController();
  state.historyRequest = controller;
  if (reset) resetFilters(section);
  closeDetail(section);
  setHistoryLoading(section);

  try {
    const query = new URLSearchParams({
      ref: state.reference,
      page: String(Math.max(1, requestedPage)),
      pageSize: '10',
    });
    const response = await requestJson<GitHistoryResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits?${query.toString()}`,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    state.resolvedReference = response.history.branch;
    state.commits = response.history.commits;
    state.page = response.history.page;
    state.pageSize = response.history.pageSize;
    state.total = response.history.total;
    state.totalPages = response.history.totalPages;
    renderAuthorOptions(section);
    renderMetrics(section);
    renderList(section);
  } catch (error) {
    if (controller.signal.aborted) return;
    const list = section.querySelector<HTMLElement>('.git-history-page-list');
    list?.replaceChildren();
    const message = document.createElement('div');
    message.className = 'git-history-page-empty is-error';
    const title = document.createElement('strong');
    title.textContent = 'Histórico indisponível';
    const description = document.createElement('p');
    description.textContent = error instanceof Error
      ? error.message
      : 'Não foi possível carregar o histórico.';
    message.append(title, description);
    list?.append(message);
  } finally {
    if (state.historyRequest === controller) state.historyRequest = undefined;
    renderPagination(section);
  }
}

function buildMetric(label: string, key: string): HTMLElement {
  const card = document.createElement('article');
  card.dataset.historyMetric = key;
  const span = document.createElement('span');
  span.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = '—';
  const small = document.createElement('small');
  small.textContent = 'Carregando…';
  card.append(span, strong, small);
  return card;
}

function buildPagination(section: HTMLElement): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'git-history-page-pagination';
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.dataset.historyPage = 'previous';
  mountIcon(previous, ChevronLeftIcon, 'git-history-page-pagination-icon');
  const previousText = document.createElement('span');
  previousText.textContent = 'Anterior';
  previous.append(previousText);
  previous.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page > 1) void loadHistory(section, state.page - 1, true);
  });

  const label = document.createElement('span');
  label.className = 'git-history-page-pagination-label';
  label.textContent = 'Nenhuma página';

  const next = document.createElement('button');
  next.type = 'button';
  next.dataset.historyPage = 'next';
  const nextText = document.createElement('span');
  nextText.textContent = 'Próxima';
  next.append(nextText);
  mountIcon(next, ChevronRightIcon, 'git-history-page-pagination-icon');
  next.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state && state.page < state.totalPages) void loadHistory(section, state.page + 1, true);
  });
  footer.append(previous, label, next);
  return footer;
}

function buildPage(section: HTMLElement, projectId: string): void {
  section.replaceChildren();
  section.classList.add('git-history-page');

  const metrics = document.createElement('div');
  metrics.className = 'git-history-page-metrics';
  metrics.append(
    buildMetric('Referência', 'reference'),
    buildMetric('Commits', 'commits'),
    buildMetric('Autores', 'authors'),
    buildMetric('Período', 'period'),
  );

  const toolbar = document.createElement('div');
  toolbar.className = 'git-history-page-toolbar';
  const referenceLabel = document.createElement('label');
  referenceLabel.className = 'git-history-page-reference';
  mountIcon(referenceLabel, TagIcon, 'git-history-page-control-icon');
  const reference = document.createElement('select');
  reference.dataset.historyControl = 'reference';
  reference.setAttribute('aria-label', 'Referência do histórico');
  reference.addEventListener('change', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.reference = reference.value;
    void loadHistory(section, 1, true);
  });
  referenceLabel.append(reference);

  const searchLabel = document.createElement('label');
  searchLabel.className = 'git-history-page-search';
  mountIcon(searchLabel, MagnifyingGlassIcon, 'git-history-page-control-icon');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Buscar hash, mensagem ou autor nesta página…';
  search.dataset.historyControl = 'search';
  search.setAttribute('aria-label', 'Buscar commits nesta página');
  search.addEventListener('input', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.search = search.value;
    renderList(section);
  });
  searchLabel.append(search);

  const authorLabel = document.createElement('label');
  authorLabel.className = 'git-history-page-author';
  mountIcon(authorLabel, UserCircleIcon, 'git-history-page-control-icon');
  const author = document.createElement('select');
  author.dataset.historyControl = 'author';
  author.setAttribute('aria-label', 'Filtrar por autor');
  author.addEventListener('change', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.author = author.value;
    renderList(section);
  });
  authorLabel.append(author);

  const kind = document.createElement('select');
  kind.dataset.historyControl = 'kind';
  kind.setAttribute('aria-label', 'Filtrar por tipo de commit');
  [
    ['all', 'Todos os commits'],
    ['regular', 'Commits comuns'],
    ['merge', 'Somente merges'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value ?? '';
    option.textContent = label ?? '';
    kind.append(option);
  });
  kind.addEventListener('change', () => {
    const state = stateBySection.get(section);
    if (!state) return;
    state.kind = kind.value as HistoryCommitKind;
    renderList(section);
  });
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'secondary-button git-history-page-refresh';
  mountIcon(refresh, ArrowPathIcon, 'git-history-page-refresh-icon');
  const refreshText = document.createElement('span');
  refreshText.textContent = 'Atualizar';
  refresh.append(refreshText);
  refresh.addEventListener('click', () => {
    const state = stateBySection.get(section);
    if (state) void loadHistory(section, state.page, false);
  });
  toolbar.append(referenceLabel, searchLabel, authorLabel, kind, refresh);

  const layout = document.createElement('section');
  layout.className = 'git-history-page-layout';
  const history = document.createElement('div');
  history.className = 'git-history-page-timeline';
  const listHeader = document.createElement('header');
  const listTitle = document.createElement('div');
  const listHeading = document.createElement('h3');
  listHeading.textContent = 'Commits';
  const filterCount = document.createElement('span');
  filterCount.className = 'git-history-page-filter-count';
  filterCount.textContent = 'Carregando…';
  listTitle.append(listHeading, filterCount);
  const keyboardHint = document.createElement('small');
  keyboardHint.textContent = '↑ ↓ para navegar · Esc para fechar';
  listHeader.append(listTitle, keyboardHint);

  const list = document.createElement('div');
  list.className = 'git-history-page-list';
  list.tabIndex = 0;
  list.addEventListener('keydown', (event) => {
    const state = stateBySection.get(section);
    if (!state) return;
    if (event.key === 'Escape') {
      closeDetail(section);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const commits = filteredCommits(state);
    if (commits.length === 0) return;
    const index = commits.findIndex((commit) => commit.hash === state.selectedHash);
    const nextIndex = event.key === 'ArrowDown'
      ? Math.min(commits.length - 1, index < 0 ? 0 : index + 1)
      : Math.max(0, index < 0 ? commits.length - 1 : index - 1);
    const next = commits[nextIndex];
    if (next) void selectCommit(section, next.hash);
  });
  history.append(listHeader, list, buildPagination(section));

  const detail = document.createElement('aside');
  detail.className = 'git-history-page-detail';
  detail.setAttribute('aria-live', 'polite');
  applyHistoryListWidth(layout, readHistoryListWidth());
  layout.append(history, buildHistoryResizer(layout), detail);
  section.append(toolbar, metrics, layout);

  const state: HistoryPageState = {
    projectId,
    reference: 'HEAD',
    resolvedReference: '',
    branches: [],
    commits: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    search: '',
    author: '',
    kind: 'all',
    selectedHash: '',
    copiedHash: '',
    historyRequest: undefined,
    detailRequest: undefined,
  };
  stateBySection.set(section, state);
  setHistoryLoading(section);

  void (async () => {
    try {
      const workspace = await requestJson<GitWorkspaceResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/git/workspace`,
      );
      state.branches = workspace.workspace.branches;
      state.reference = currentReference(state.branches);
      renderReferenceOptions(section);
      await loadHistory(section, 1, true);
    } catch (error) {
      const list = section.querySelector<HTMLElement>('.git-history-page-list');
      list?.replaceChildren();
      const message = document.createElement('div');
      message.className = 'git-history-page-empty is-error';
      const title = document.createElement('strong');
      title.textContent = 'Não foi possível abrir o histórico';
      const description = document.createElement('p');
      description.textContent = error instanceof Error ? error.message : 'Falha ao carregar branches.';
      message.append(title, description);
      list?.append(message);
    }
  })();
}

function enhanceHistory(section: HTMLElement): void {
  if (section.dataset.historyPageEnhanced === 'true') return;
  const projectId = projectIdFromLocation();
  if (!projectId) return;
  section.dataset.historyPageEnhanced = 'true';
  buildPage(section, projectId);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-history-list')) {
    const section = root.closest<HTMLElement>('.git-tab-page');
    if (section) enhanceHistory(section);
  }
  root.querySelectorAll<HTMLElement>('.git-history-list').forEach((list) => {
    const section = list.closest<HTMLElement>('.git-tab-page');
    if (section) enhanceHistory(section);
  });
}

export function installGitHistoryPageEnhancer(): void {
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
