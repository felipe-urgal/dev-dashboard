import { h, render } from 'vue';
import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';

interface GitOverviewResponse {
  git: {
    branch?: string;
    detached: boolean;
    files: Array<{ path: string }>;
  };
}

interface GitStashSummary {
  index: number;
  reference: string;
  hash: string;
  message: string;
  branch: string;
  createdAt: string;
  fileCount: number;
  additions: number;
  deletions: number;
  includesUntracked: boolean;
}

interface GitStashFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted' | 'type-changed';
  additions: number;
  deletions: number;
  binary: boolean;
}

interface GitStashDetail extends GitStashSummary {
  files: GitStashFile[];
  patch: string;
  truncated: boolean;
  masked: boolean;
  redactionCount: number;
}

interface StashListResponse {
  stashes: GitStashSummary[];
}

interface StashDetailResponse {
  detail: GitStashDetail;
}

interface ConfirmationResponse {
  confirmation: {
    token: string;
  };
}

interface MutationResponse {
  result: {
    stash: GitStashSummary;
    applied: boolean;
    removed: boolean;
  };
}

type StashOperation = 'create' | 'apply' | 'pop' | 'drop';

interface StashPageState {
  projectId: string;
  branch: string;
  detached: boolean;
  changedFiles: number;
  stashes: GitStashSummary[];
  selectedReference: string;
  detail: GitStashDetail | null;
  busy: boolean;
  listRequest: AbortController | undefined;
  detailRequest: AbortController | undefined;
}

interface PersistedNotice {
  message: string;
  selectedReference?: string;
}

const stateBySection = new WeakMap<HTMLElement, StashPageState>();
const NOTICE_KEY = 'dev-dashboard-git-stash-notice';

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

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
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

function statusLabel(status: GitStashFile['status']): string {
  const labels: Record<GitStashFile['status'], string> = {
    added: 'Adicionado',
    modified: 'Modificado',
    deleted: 'Removido',
    renamed: 'Renomeado',
    copied: 'Copiado',
    untracked: 'Não rastreado',
    conflicted: 'Conflito',
    'type-changed': 'Tipo alterado',
  };
  return labels[status];
}

function patchView(patch: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'git-stash-patch';
  if (!patch.trim()) {
    pre.textContent = 'Este stash não possui diff textual para exibir.';
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

function setNotice(section: HTMLElement, message: string, tone: 'success' | 'error' | 'info' = 'info'): void {
  const host = section.querySelector<HTMLElement>('.git-stash-notice');
  if (!host) return;
  host.textContent = message;
  host.className = `git-stash-notice is-${tone}`;
  host.hidden = !message;
}

function persistAndReload(message: string, selectedReference?: string): void {
  const notice: PersistedNotice = {
    message,
    ...(selectedReference ? { selectedReference } : {}),
  };
  window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify(notice));
  window.location.reload();
}

function readPersistedNotice(): PersistedNotice | null {
  const raw = window.sessionStorage.getItem(NOTICE_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(NOTICE_KEY);
  try {
    return JSON.parse(raw) as PersistedNotice;
  } catch {
    return null;
  }
}

function refreshControls(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  section.classList.toggle('is-busy', state.busy);
  section.querySelectorAll<HTMLInputElement | HTMLButtonElement>('[data-stash-control]')
    .forEach((element) => {
      const action = element.dataset.stashControl;
      if (action === 'create') {
        element.disabled = state.busy || state.changedFiles === 0;
      } else if (action === 'restore') {
        element.disabled = state.busy || state.changedFiles > 0 || !state.detail;
      } else if (action === 'drop') {
        element.disabled = state.busy || !state.detail;
      } else {
        element.disabled = state.busy;
      }
    });
}

function renderMetrics(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  const branch = section.querySelector<HTMLElement>('[data-stash-metric="branch"] strong');
  const changes = section.querySelector<HTMLElement>('[data-stash-metric="changes"] strong');
  const saved = section.querySelector<HTMLElement>('[data-stash-metric="saved"] strong');
  if (branch) branch.textContent = state.detached ? 'HEAD destacado' : state.branch;
  if (changes) changes.textContent = String(state.changedFiles);
  if (saved) saved.textContent = String(state.stashes.length);
  const restoreHint = section.querySelector<HTMLElement>('.git-stash-restore-hint');
  if (restoreHint) {
    restoreHint.textContent = state.changedFiles > 0
      ? 'Limpe ou guarde o working tree antes de aplicar um stash.'
      : 'Working tree limpo: o stash pode ser restaurado com segurança.';
    restoreHint.classList.toggle('is-warning', state.changedFiles > 0);
  }
  refreshControls(section);
}

function stashListItem(section: HTMLElement, stash: GitStashSummary): HTMLButtonElement {
  const state = stateBySection.get(section)!;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'git-stash-list-item';
  button.classList.toggle('active', stash.reference === state.selectedReference);

  const top = document.createElement('span');
  top.className = 'git-stash-list-top';
  const reference = document.createElement('code');
  reference.textContent = stash.reference;
  const date = document.createElement('time');
  date.dateTime = stash.createdAt;
  date.textContent = relativeDate(stash.createdAt);
  date.title = formatDate(stash.createdAt);
  top.append(reference, date);

  const message = document.createElement('strong');
  message.textContent = stash.message;
  const branch = document.createElement('small');
  branch.textContent = `Criado em ${stash.branch}`;

  const stats = document.createElement('span');
  stats.className = 'git-stash-list-stats';
  const files = document.createElement('span');
  files.textContent = `${stash.fileCount} arquivo${stash.fileCount === 1 ? '' : 's'}`;
  const additions = document.createElement('span');
  additions.className = 'is-addition';
  additions.textContent = `+${stash.additions}`;
  const deletions = document.createElement('span');
  deletions.className = 'is-deletion';
  deletions.textContent = `−${stash.deletions}`;
  stats.append(files, additions, deletions);
  if (stash.includesUntracked) {
    const untracked = document.createElement('span');
    untracked.className = 'is-untracked';
    untracked.textContent = 'inclui novos';
    stats.append(untracked);
  }

  mountIcon(button, ChevronRightIcon, 'git-stash-row-icon');
  button.prepend(top, message, branch, stats);
  button.addEventListener('click', () => {
    void selectStash(section, stash.reference);
  });
  return button;
}

function renderList(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const list = section.querySelector<HTMLElement>('.git-stash-list');
  const count = section.querySelector<HTMLElement>('.git-stash-list-count');
  if (!state || !list) return;
  list.replaceChildren();
  if (count) count.textContent = `${state.stashes.length} salvo${state.stashes.length === 1 ? '' : 's'}`;

  if (state.stashes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'git-stash-empty';
    mountIcon(empty, ArchiveBoxIcon, 'git-stash-empty-icon');
    const title = document.createElement('strong');
    title.textContent = 'Nenhum stash salvo';
    const copy = document.createElement('p');
    copy.textContent = 'Use o formulário acima para guardar trabalho temporário.';
    empty.append(title, copy);
    list.append(empty);
    return;
  }

  state.stashes.forEach((stash) => list.append(stashListItem(section, stash)));
}

function renderDetailLoading(section: HTMLElement, reference: string): void {
  const host = section.querySelector<HTMLElement>('.git-stash-detail');
  if (!host) return;
  host.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-stash-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-stash-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = reference;
  const text = document.createElement('span');
  text.textContent = 'Carregando arquivos e diff…';
  copy.append(title, text);
  loading.append(copy);
  host.append(loading);
}

function renderEmptyDetail(section: HTMLElement): void {
  const host = section.querySelector<HTMLElement>('.git-stash-detail');
  if (!host) return;
  host.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'git-stash-detail-empty';
  mountIcon(empty, DocumentTextIcon, 'git-stash-detail-empty-icon');
  const title = document.createElement('strong');
  title.textContent = 'Selecione um stash';
  const copy = document.createElement('p');
  copy.textContent = 'Os arquivos, estatísticas e ações aparecerão aqui.';
  empty.append(title, copy);
  host.append(empty);
}

function detailAction(
  label: string,
  className: string,
  control: string,
  handler: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.stashControl = control;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderDetail(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const detail = state?.detail;
  const host = section.querySelector<HTMLElement>('.git-stash-detail');
  if (!state || !detail || !host) {
    renderEmptyDetail(section);
    return;
  }
  host.replaceChildren();

  const header = document.createElement('header');
  header.className = 'git-stash-detail-header';
  const heading = document.createElement('div');
  mountIcon(heading, ArchiveBoxIcon, 'git-stash-detail-icon');
  const copy = document.createElement('div');
  const reference = document.createElement('code');
  reference.textContent = detail.reference;
  const title = document.createElement('h3');
  title.textContent = detail.message;
  const metadata = document.createElement('p');
  metadata.textContent = `${detail.branch} · ${formatDate(detail.createdAt)}`;
  copy.append(reference, title, metadata);
  heading.append(copy);
  header.append(heading);

  const metrics = document.createElement('div');
  metrics.className = 'git-stash-detail-metrics';
  [
    [`${detail.fileCount}`, 'arquivos', ''],
    [`+${detail.additions}`, 'adições', 'is-addition'],
    [`−${detail.deletions}`, 'remoções', 'is-deletion'],
  ].forEach(([value, label, className]) => {
    const metric = document.createElement('span');
    if (className) metric.className = className;
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = label;
    metric.append(strong, small);
    metrics.append(metric);
  });

  const hint = document.createElement('p');
  hint.className = 'git-stash-restore-hint';

  const actions = document.createElement('div');
  actions.className = 'git-stash-detail-actions';
  actions.append(
    detailAction('Aplicar e manter', 'secondary-button', 'restore', () => {
      void runStashMutation(section, 'apply');
    }),
    detailAction('Restaurar e remover', 'primary-button', 'restore', () => {
      void runStashMutation(section, 'pop');
    }),
    detailAction('Excluir stash', 'git-stash-danger-button', 'drop', () => {
      void runStashMutation(section, 'drop');
    }),
  );

  const files = document.createElement('section');
  files.className = 'git-stash-files';
  const filesHeader = document.createElement('header');
  const filesTitle = document.createElement('h4');
  filesTitle.textContent = 'Arquivos guardados';
  const filesCount = document.createElement('span');
  filesCount.textContent = `${detail.files.length} item${detail.files.length === 1 ? '' : 's'}`;
  filesHeader.append(filesTitle, filesCount);
  const list = document.createElement('ul');
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
    list.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-stash-file-empty';
    empty.textContent = 'Nenhum arquivo identificado.';
    list.append(empty);
  }
  files.append(filesHeader, list);

  const diff = document.createElement('details');
  diff.className = 'git-stash-diff';
  const summary = document.createElement('summary');
  mountIcon(summary, CodeBracketSquareIcon, 'git-stash-diff-icon');
  const summaryText = document.createElement('span');
  summaryText.textContent = 'Ver diff completo';
  summary.append(summaryText);
  const warnings = document.createElement('div');
  warnings.className = 'git-stash-warnings';
  if (detail.masked) {
    const warning = document.createElement('p');
    warning.textContent = `${detail.redactionCount} possível(is) segredo(s) foram mascarados.`;
    warnings.append(warning);
  }
  if (detail.truncated) {
    const warning = document.createElement('p');
    warning.textContent = 'O diff foi truncado para manter a interface responsiva.';
    warnings.append(warning);
  }
  diff.append(summary, warnings, patchView(detail.patch));

  host.append(header, metrics, hint, actions, files, diff);
  renderMetrics(section);
}

async function selectStash(section: HTMLElement, reference: string): Promise<void> {
  const state = stateBySection.get(section);
  if (!state || state.selectedReference === reference && state.detail) return;
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.detailRequest = controller;
  state.selectedReference = reference;
  state.detail = null;
  renderList(section);
  renderDetailLoading(section, reference);
  refreshControls(section);

  try {
    const response = await requestJson<StashDetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes/${encodeURIComponent(reference)}`,
      { signal: controller.signal },
    );
    if (!controller.signal.aborted && state.selectedReference === reference) {
      state.detail = response.detail;
      renderDetail(section);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      setNotice(
        section,
        error instanceof Error ? error.message : 'Não foi possível inspecionar o stash.',
        'error',
      );
      renderEmptyDetail(section);
    }
  } finally {
    if (state.detailRequest === controller) state.detailRequest = undefined;
    refreshControls(section);
  }
}

async function loadStashes(section: HTMLElement, preferredReference = ''): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  state.listRequest?.abort();
  const controller = new AbortController();
  state.listRequest = controller;
  setNotice(section, 'Atualizando working tree e stashes…');

  try {
    const [overview, list] = await Promise.all([
      requestJson<GitOverviewResponse>(
        `/api/projects/${encodeURIComponent(state.projectId)}/git`,
        { signal: controller.signal },
      ),
      requestJson<StashListResponse>(
        `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes`,
        { signal: controller.signal },
      ),
    ]);
    if (controller.signal.aborted) return;
    state.branch = overview.git.branch ?? 'HEAD';
    state.detached = overview.git.detached;
    state.changedFiles = overview.git.files.length;
    state.stashes = list.stashes;
    const preferred = preferredReference || state.selectedReference;
    state.selectedReference = state.stashes.some((stash) => stash.reference === preferred)
      ? preferred
      : state.stashes[0]?.reference ?? '';
    state.detail = null;
    renderMetrics(section);
    renderList(section);
    setNotice(section, '');
    if (state.selectedReference) {
      await selectStash(section, state.selectedReference);
    } else {
      renderEmptyDetail(section);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      setNotice(
        section,
        error instanceof Error ? error.message : 'Não foi possível carregar os stashes.',
        'error',
      );
    }
  } finally {
    if (state.listRequest === controller) state.listRequest = undefined;
    refreshControls(section);
  }
}

async function prepareConfirmation(
  state: StashPageState,
  operation: StashOperation,
  target: string,
): Promise<string> {
  const response = await requestJson<ConfirmationResponse>(
    `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes/confirmations`,
    {
      method: 'POST',
      body: JSON.stringify({ operation, target }),
    },
  );
  return response.confirmation.token;
}

async function runCreate(section: HTMLElement): Promise<void> {
  const state = stateBySection.get(section);
  if (!state || state.busy) return;
  const messageInput = section.querySelector<HTMLInputElement>('[data-stash-field="message"]');
  const includeUntracked = section.querySelector<HTMLInputElement>('[data-stash-field="untracked"]');
  const keepIndex = section.querySelector<HTMLInputElement>('[data-stash-field="keep-index"]');
  const message = messageInput?.value.trim() ?? '';
  const confirmation = `Guardar ${state.changedFiles} alteração(ões) da branch "${state.branch}" no stash${message ? ` como "${message}"` : ''}?`;
  if (!window.confirm(confirmation)) return;

  state.busy = true;
  refreshControls(section);
  setNotice(section, 'Criando stash…');
  try {
    const token = await prepareConfirmation(state, 'create', state.branch);
    const response = await requestJson<MutationResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes`,
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          includeUntracked: includeUntracked?.checked ?? true,
          keepIndex: keepIndex?.checked ?? false,
          confirmationToken: token,
        }),
      },
    );
    persistAndReload(
      `Stash criado: ${response.result.stash.message}`,
      response.result.stash.reference,
    );
  } catch (error) {
    state.busy = false;
    setNotice(
      section,
      error instanceof Error ? error.message : 'Não foi possível criar o stash.',
      'error',
    );
    refreshControls(section);
  }
}

async function runStashMutation(
  section: HTMLElement,
  operation: 'apply' | 'pop' | 'drop',
): Promise<void> {
  const state = stateBySection.get(section);
  const detail = state?.detail;
  if (!state || !detail || state.busy) return;
  if (operation !== 'drop' && state.changedFiles > 0) {
    setNotice(section, 'O working tree precisa estar limpo para restaurar este stash.', 'error');
    return;
  }

  const question = operation === 'apply'
    ? `Aplicar "${detail.message}" e manter o stash salvo?`
    : operation === 'pop'
      ? `Restaurar "${detail.message}" e remover o stash da lista?`
      : `Excluir definitivamente "${detail.message}" sem restaurar as alterações?`;
  if (!window.confirm(question)) return;

  state.busy = true;
  refreshControls(section);
  setNotice(section, operation === 'drop' ? 'Excluindo stash…' : 'Restaurando stash…');
  try {
    const token = await prepareConfirmation(state, operation, detail.reference);
    const response = await requestJson<MutationResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes/${encodeURIComponent(detail.reference)}/${operation}`,
      {
        method: 'POST',
        body: JSON.stringify({ confirmationToken: token }),
      },
    );
    const message = operation === 'apply'
      ? `Stash aplicado e preservado: ${response.result.stash.message}`
      : operation === 'pop'
        ? `Stash restaurado e removido: ${response.result.stash.message}`
        : `Stash excluído: ${response.result.stash.message}`;
    persistAndReload(message, operation === 'apply' ? detail.reference : undefined);
  } catch (error) {
    state.busy = false;
    setNotice(
      section,
      error instanceof Error ? error.message : 'Não foi possível concluir a operação.',
      'error',
    );
    refreshControls(section);
  }
}

function metricCard(label: string, key: string, hint: string): HTMLElement {
  const article = document.createElement('article');
  article.dataset.stashMetric = key;
  const span = document.createElement('span');
  span.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = '—';
  const small = document.createElement('small');
  small.textContent = hint;
  article.append(span, strong, small);
  return article;
}

function buildStashPage(section: HTMLElement, projectId: string): void {
  const state: StashPageState = {
    projectId,
    branch: 'HEAD',
    detached: false,
    changedFiles: 0,
    stashes: [],
    selectedReference: '',
    detail: null,
    busy: false,
    listRequest: undefined,
    detailRequest: undefined,
  };
  stateBySection.set(section, state);
  section.dataset.stashEnhanced = 'true';

  const shell = document.createElement('div');
  shell.className = 'git-stash-modern-shell';

  const heading = document.createElement('header');
  heading.className = 'git-stash-page-heading';
  const title = document.createElement('div');
  mountIcon(title, ArchiveBoxIcon, 'git-stash-heading-icon');
  const titleCopy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Stash';
  const h2 = document.createElement('h2');
  h2.textContent = 'Guardar trabalho temporário';
  const description = document.createElement('p');
  description.textContent = 'Crie, inspecione e restaure stashes sem perder o contexto da branch.';
  titleCopy.append(eyebrow, h2, description);
  title.append(titleCopy);
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'secondary-button';
  refresh.dataset.stashControl = 'refresh';
  mountIcon(refresh, ArrowPathIcon, 'git-stash-refresh-icon');
  const refreshText = document.createElement('span');
  refreshText.textContent = 'Atualizar';
  refresh.append(refreshText);
  refresh.addEventListener('click', () => void loadStashes(section));
  heading.append(title, refresh);

  const notice = document.createElement('p');
  notice.className = 'git-stash-notice is-info';
  notice.hidden = true;
  notice.setAttribute('aria-live', 'polite');

  const metrics = document.createElement('div');
  metrics.className = 'git-stash-metrics';
  metrics.append(
    metricCard('Branch atual', 'branch', 'contexto do stash'),
    metricCard('Working tree', 'changes', 'alterações locais'),
    metricCard('Stashes salvos', 'saved', 'até 50 exibidos'),
  );

  const createCard = document.createElement('form');
  createCard.className = 'git-stash-create-card';
  createCard.addEventListener('submit', (event) => {
    event.preventDefault();
    void runCreate(section);
  });
  const createHeading = document.createElement('div');
  const createEyebrow = document.createElement('span');
  createEyebrow.textContent = 'Novo stash';
  const createTitle = document.createElement('h3');
  createTitle.textContent = 'Guardar alterações atuais';
  const createCopy = document.createElement('p');
  createCopy.textContent = 'A mensagem é opcional e ajuda a localizar o trabalho depois.';
  createHeading.append(createEyebrow, createTitle, createCopy);

  const fields = document.createElement('div');
  fields.className = 'git-stash-create-fields';
  const messageLabel = document.createElement('label');
  const messageTitle = document.createElement('span');
  messageTitle.textContent = 'Mensagem';
  const message = document.createElement('input');
  message.type = 'text';
  message.maxLength = 200;
  message.placeholder = 'Ex.: ajuste temporário do formulário';
  message.dataset.stashField = 'message';
  message.dataset.stashControl = 'field';
  messageLabel.append(messageTitle, message);

  const options = document.createElement('div');
  options.className = 'git-stash-create-options';
  const untrackedLabel = document.createElement('label');
  const untracked = document.createElement('input');
  untracked.type = 'checkbox';
  untracked.checked = true;
  untracked.dataset.stashField = 'untracked';
  untracked.dataset.stashControl = 'field';
  untrackedLabel.append(untracked, document.createTextNode('Incluir arquivos não rastreados'));
  const keepIndexLabel = document.createElement('label');
  const keepIndex = document.createElement('input');
  keepIndex.type = 'checkbox';
  keepIndex.dataset.stashField = 'keep-index';
  keepIndex.dataset.stashControl = 'field';
  keepIndexLabel.append(keepIndex, document.createTextNode('Manter alterações staged no índice'));
  options.append(untrackedLabel, keepIndexLabel);

  const createButton = document.createElement('button');
  createButton.type = 'submit';
  createButton.className = 'primary-button';
  createButton.dataset.stashControl = 'create';
  createButton.textContent = 'Guardar no stash';
  fields.append(messageLabel, options, createButton);
  createCard.append(createHeading, fields);

  const layout = document.createElement('div');
  layout.className = 'git-stash-layout';
  const navigator = document.createElement('aside');
  navigator.className = 'git-stash-navigator';
  const navigatorHeader = document.createElement('header');
  const navigatorTitle = document.createElement('div');
  const navigatorHeading = document.createElement('h3');
  navigatorHeading.textContent = 'Stashes salvos';
  const navigatorCount = document.createElement('span');
  navigatorCount.className = 'git-stash-list-count';
  navigatorCount.textContent = 'Carregando…';
  navigatorTitle.append(navigatorHeading, navigatorCount);
  navigatorHeader.append(navigatorTitle);
  const list = document.createElement('div');
  list.className = 'git-stash-list';
  navigator.append(navigatorHeader, list);

  const detail = document.createElement('main');
  detail.className = 'git-stash-detail';
  detail.setAttribute('aria-live', 'polite');
  layout.append(navigator, detail);

  shell.append(heading, notice, metrics, createCard, layout);
  section.replaceChildren(shell);

  const persisted = readPersistedNotice();
  if (persisted?.message) setNotice(section, persisted.message, 'success');
  void loadStashes(section, persisted?.selectedReference ?? '');
}

function isStashSection(section: HTMLElement): boolean {
  if (section.dataset.stashEnhanced === 'true') return true;
  return section.querySelector('.git-page-heading span')?.textContent?.trim() === 'Stash';
}

function enhanceStash(section: HTMLElement): void {
  if (!isStashSection(section)) return;
  if (section.querySelector('.git-stash-modern-shell')) return;
  const projectId = projectIdFromLocation();
  if (!projectId) return;
  buildStashPage(section, projectId);
}

function scan(root: ParentNode = document): void {
  if (root instanceof HTMLElement && root.matches('.git-tab-page')) {
    enhanceStash(root);
  }
  root.querySelectorAll<HTMLElement>('.git-tab-page').forEach(enhanceStash);
}

export function installGitStashEnhancer(): void {
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
