import {
  ArchiveBoxIcon,
  ArrowPathIcon,
} from '@heroicons/vue/24/outline';

import { renderEmptyDetail, selectStash } from './git-stash/detail';
import { mountIcon, projectIdFromLocation, requestJson } from './git-stash/dom-helpers';
import { refreshControls, renderMetrics } from './git-stash/controls';
import { renderList } from './git-stash/list';
import { runCreate } from './git-stash/actions';
import { readPersistedNotice, setNotice } from './git-stash/notice';
import { stateBySection } from './git-stash/state';
import type { GitOverviewResponse, StashListResponse, StashPageState } from './git-stash/types';

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
