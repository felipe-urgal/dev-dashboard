import { h, render, type Component } from 'vue';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CommandLineIcon,
  DocumentCheckIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/vue/24/outline';

export type CommitFileKind = 'staged' | 'modified' | 'untracked';
export type CommitFileFilter = 'all' | CommitFileKind;

const conventionalTypes = ['feat', 'fix', 'refactor', 'chore', 'docs', 'test'] as const;

function mountIcon(host: HTMLElement, icon: Component, className: string): void {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(icon, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
}

export function classifyGitStatus(status: string, label = ''): CommitFileKind[] {
  const normalized = status.trim();
  const [index = '.', worktree = '.'] = normalized.split('/');
  const kinds: CommitFileKind[] = [];

  if (label.toLocaleLowerCase('pt-BR').includes('não rastreado') || index === '?' || worktree === '?') {
    kinds.push('untracked');
    return kinds;
  }

  if (index !== '.' && index !== ' ') kinds.push('staged');
  if (worktree !== '.' && worktree !== ' ') kinds.push('modified');
  return kinds;
}

export function matchesCommitFile(
  text: string,
  kinds: readonly CommitFileKind[],
  filter: CommitFileFilter,
  search: string,
): boolean {
  const matchesFilter = filter === 'all' || kinds.includes(filter);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  return matchesFilter && (
    normalizedSearch.length === 0 || text.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  );
}

export function withCommitPrefix(message: string, type: string): string {
  const trimmed = message.trimStart();
  const knownPrefix = /^(feat|fix|refactor|chore|docs|test)(?:\([^)]*\))?!?:\s*/i;
  if (knownPrefix.test(trimmed)) return trimmed.replace(knownPrefix, `${type}: `);
  return `${type}: ${trimmed}`;
}

function branchType(branch: string): string | undefined {
  const candidate = branch.split('/')[0]?.toLocaleLowerCase('pt-BR');
  if (!candidate) return undefined;
  if (candidate === 'feature') return 'feat';
  if (candidate === 'hotfix' || candidate === 'bugfix') return 'fix';
  return conventionalTypes.includes(candidate as (typeof conventionalTypes)[number])
    ? candidate
    : undefined;
}

function findTab(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.git-subtabs button'))
    .find((button) => button.textContent?.trim() === label);
}

function addPageHeading(section: HTMLElement, branch: string): void {
  const heading = document.createElement('header');
  heading.className = 'git-commit-page-heading';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'git-commit-page-title';
  mountIcon(titleGroup, DocumentCheckIcon, 'git-commit-heading-icon');

  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Commit';
  const title = document.createElement('h2');
  title.textContent = 'Preparar e registrar alterações';
  const description = document.createElement('p');
  description.textContent = 'Revise os arquivos, escolha o escopo e crie um commit com uma mensagem clara.';
  copy.append(eyebrow, title, description);
  titleGroup.append(copy);

  const branchBadge = document.createElement('span');
  branchBadge.className = 'git-commit-branch-badge';
  branchBadge.textContent = branch || 'HEAD';

  heading.append(titleGroup, branchBadge);
  section.prepend(heading);
}

interface FileRowState {
  row: HTMLElement;
  text: string;
  kinds: CommitFileKind[];
}

function enhanceFiles(section: HTMLElement): { counts: Record<CommitFileKind, number>; refresh: () => void } {
  const card = section.querySelector<HTMLElement>('.files-card');
  const list = card?.querySelector<HTMLElement>('.git-file-list-modern');
  const rows = Array.from(list?.querySelectorAll<HTMLElement>(':scope > li') ?? []);
  const counts: Record<CommitFileKind, number> = { staged: 0, modified: 0, untracked: 0 };
  let activeFilter: CommitFileFilter = 'all';
  let search = '';

  const states: FileRowState[] = rows.map((row) => {
    const status = row.querySelector('small')?.textContent ?? '';
    const label = row.querySelector('[class*="status"], span')?.textContent ?? '';
    const kinds = classifyGitStatus(status, label);
    kinds.forEach((kind) => { counts[kind] += 1; });
    row.dataset.commitKinds = kinds.join(' ');

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'git-commit-file-diff';
    action.title = 'Abrir a área de diff';
    mountIcon(action, ArrowRightIcon, 'git-commit-row-icon');
    const actionText = document.createElement('span');
    actionText.textContent = 'Diff';
    action.append(actionText);
    action.addEventListener('click', () => findTab('Diff')?.click());
    row.append(action);

    return { row, text: row.textContent ?? '', kinds };
  });

  const empty = document.createElement('p');
  empty.className = 'git-commit-filter-empty';
  empty.hidden = true;
  empty.textContent = 'Nenhum arquivo corresponde a este filtro.';
  list?.after(empty);

  const refresh = (): void => {
    let visible = 0;
    for (const state of states) {
      const matches = matchesCommitFile(state.text, state.kinds, activeFilter, search);
      state.row.hidden = !matches;
      if (matches) visible += 1;
    }
    empty.hidden = visible > 0 || rows.length === 0;
  };

  if (card) {
    const toolbar = document.createElement('div');
    toolbar.className = 'git-commit-file-toolbar';

    const filters = document.createElement('div');
    filters.className = 'git-commit-file-filters';
    filters.setAttribute('aria-label', 'Filtrar arquivos do commit');
    mountIcon(filters, FunnelIcon, 'git-commit-toolbar-icon');

    const definitions: Array<[CommitFileFilter, string, number]> = [
      ['all', 'Todos', rows.length],
      ['staged', 'Staged', counts.staged],
      ['modified', 'Modificados', counts.modified],
      ['untracked', 'Novos', counts.untracked],
    ];
    definitions.forEach(([value, label, count], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === 0 ? 'active' : '';
      button.dataset.filter = value;
      button.innerHTML = `<span>${label}</span><b>${count}</b>`;
      button.addEventListener('click', () => {
        activeFilter = value;
        filters.querySelectorAll('button').forEach((candidate) => {
          candidate.classList.toggle('active', candidate === button);
        });
        refresh();
      });
      filters.append(button);
    });

    const searchLabel = document.createElement('label');
    searchLabel.className = 'git-commit-file-search';
    mountIcon(searchLabel, MagnifyingGlassIcon, 'git-commit-search-icon');
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Buscar arquivo alterado…';
    input.setAttribute('aria-label', 'Buscar arquivo alterado');
    input.addEventListener('input', () => {
      search = input.value;
      refresh();
    });
    searchLabel.append(input);

    toolbar.append(filters, searchLabel);
    card.querySelector('header')?.after(toolbar);
  }

  refresh();
  return { counts, refresh };
}

function messageEditor(form: HTMLFormElement, branch: string): void {
  const textarea = form.querySelector<HTMLTextAreaElement>('textarea');
  if (!textarea) return;

  const editor = document.createElement('div');
  editor.className = 'git-commit-message-tools';
  const label = document.createElement('span');
  label.textContent = 'Tipo de alteração';
  const chips = document.createElement('div');
  chips.className = 'git-commit-type-chips';
  const suggested = branchType(branch);

  conventionalTypes.forEach((type) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = type;
    button.classList.toggle('suggested', type === suggested);
    button.title = type === suggested ? 'Sugerido pela branch atual' : `Usar prefixo ${type}:`;
    button.addEventListener('click', () => {
      textarea.value = withCommitPrefix(textarea.value, type);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    chips.append(button);
  });

  const counter = document.createElement('span');
  counter.className = 'git-commit-character-counter';
  const updateCounter = (): void => {
    counter.textContent = `${textarea.value.length}/500`;
    counter.classList.toggle('warning', textarea.value.length > 72);
  };
  textarea.addEventListener('input', updateCounter);
  updateCounter();

  editor.append(label, chips, counter);
  textarea.closest('label')?.after(editor);
}

function enhanceComposer(
  section: HTMLElement,
  branch: string,
  counts: Record<CommitFileKind, number>,
): void {
  const formsHost = section.querySelector<HTMLElement>('.git-commit-forms');
  const forms = Array.from(formsHost?.querySelectorAll<HTMLFormElement>(':scope > form') ?? []);
  if (!formsHost || forms.length < 2) return;

  formsHost.classList.add('git-commit-composer');
  const standardForm = forms[0]!;
  const saveForm = forms[1]!;
  standardForm.dataset.commitMode = 'staged';
  saveForm.dataset.commitMode = 'all';

  const switcher = document.createElement('div');
  switcher.className = 'git-commit-mode-switcher';
  const intro = document.createElement('div');
  intro.className = 'git-commit-composer-intro';
  mountIcon(intro, CheckCircleIcon, 'git-commit-composer-icon');
  const introCopy = document.createElement('div');
  const introTitle = document.createElement('strong');
  introTitle.textContent = 'Criar commit';
  const introText = document.createElement('span');
  introText.textContent = 'Escolha o que será incluído antes de confirmar.';
  introCopy.append(introTitle, introText);
  intro.append(introCopy);

  const tabs = document.createElement('div');
  tabs.className = 'git-commit-mode-tabs';
  const definitions: Array<[HTMLFormElement, string, string]> = [
    [standardForm, 'Commit staged', `${counts.staged} pronto(s)`],
    [saveForm, 'Salvar tudo', `${counts.modified + counts.untracked} pendente(s)`],
  ];

  const activate = (active: HTMLFormElement): void => {
    definitions.forEach(([form]) => { form.hidden = form !== active; });
    tabs.querySelectorAll('button').forEach((button, index) => {
      button.classList.toggle('active', definitions[index]?.[0] === active);
    });
  };

  definitions.forEach(([form, label, detail], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = index === 0 ? 'active' : '';
    button.innerHTML = `<strong>${label}</strong><span>${detail}</span>`;
    button.addEventListener('click', () => activate(form));
    tabs.append(button);
  });

  switcher.append(intro, tabs);
  formsHost.prepend(switcher);
  activate(standardForm);

  messageEditor(standardForm, branch);
  messageEditor(saveForm, branch);

  const warning = document.createElement('p');
  warning.className = 'git-commit-staged-warning';
  const checkbox = standardForm.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const updateWarning = (): void => {
    const includeTracked = checkbox?.checked ?? false;
    warning.hidden = counts.staged > 0 || includeTracked;
    warning.textContent = 'Nenhum arquivo está staged. Marque “Incluir alterações rastreadas” ou use “Salvar tudo”.';
  };
  checkbox?.addEventListener('change', updateWarning);
  standardForm.querySelector('button[type="submit"]')?.before(warning);
  updateWarning();

  const shortcut = document.createElement('p');
  shortcut.className = 'git-commit-shortcut';
  mountIcon(shortcut, CommandLineIcon, 'git-commit-shortcut-icon');
  const shortcutText = document.createElement('span');
  shortcutText.textContent = 'Ctrl/⌘ + Enter para confirmar';
  shortcut.append(shortcutText);
  formsHost.append(shortcut);

  formsHost.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const active = definitions.find(([form]) => !form.hidden)?.[0];
    active?.requestSubmit();
  });
}

function enhanceCommitPage(section: HTMLElement): void {
  if (section.dataset.commitEnhanced === 'true') return;
  const metrics = section.querySelector<HTMLElement>('.commit-metrics');
  const layout = section.querySelector<HTMLElement>('.git-commit-layout');
  if (!metrics || !layout) return;

  section.dataset.commitEnhanced = 'true';
  section.classList.add('git-commit-page-enhanced');
  const branch = metrics.querySelector('article strong')?.textContent?.trim() ?? 'HEAD';
  addPageHeading(section, branch);
  const files = enhanceFiles(section);
  enhanceComposer(section, branch, files.counts);
}

function scan(root: ParentNode = document): void {
  const candidates = root instanceof HTMLElement && root.matches('.git-tab-page')
    ? [root]
    : Array.from(root.querySelectorAll<HTMLElement>('.git-tab-page'));
  candidates.forEach(enhanceCommitPage);
}

export function installGitCommitEnhancer(): void {
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
