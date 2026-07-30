import { h, render } from 'vue';
import {
  Bars3BottomLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import {
  buildSplitGitDiffRows,
  parseUnifiedGitDiff,
  type GitUnifiedDiffLine,
} from './utils/git-diff-view';
import { findGitPatchForFile } from './utils/git-file-patch';

type DiffViewMode = 'unified' | 'split';

interface DetailConfiguration {
  container: string;
  files: string;
  patch: string;
  fullDiffSummary: string;
}

const VIEW_MODE_KEY = 'dev-dashboard-git-inline-diff-mode';
const TARGET_FILE_KEY = 'dev-dashboard-git-target-diff-file';

// O texto bruto do patch combinado é preservado em data-raw-patch pelas funções
// patchView() que criam esse <pre> (git-history-page-enhancer.ts,
// git-summary-history-enhancer.ts, git-stash-enhancer.ts). Ler apenas `.textContent`
// pegaria a versão já reescrita por outros enhancers (destaque de sintaxe, limpeza de
// cabeçalhos redundantes), sem as linhas "diff --git" que `findGitPatchForFile` precisa
// para separar o patch por arquivo.
function rawPatchOf(element: HTMLElement): string {
  return element.dataset.rawPatch ?? element.textContent ?? '';
}

const configurations: DetailConfiguration[] = [
  {
    container: '.git-summary-commit-detail',
    files: '.git-summary-detail-files',
    patch: '.git-summary-detail-diff pre',
    fullDiffSummary: '.git-summary-detail-diff summary',
  },
  {
    container: '.git-history-page-detail',
    files: '.git-history-page-detail-files',
    patch: '.git-history-page-diff pre',
    fullDiffSummary: '.git-history-page-diff summary',
  },
  {
    container: '.git-stash-detail',
    files: '.git-stash-files',
    patch: '.git-stash-diff pre',
    fullDiffSummary: '.git-stash-diff summary',
  },
];

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

function readViewMode(): DiffViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

function persistViewMode(mode: DiffViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Preferência visual opcional.
  }
}

function linePrefix(line: GitUnifiedDiffLine | null): string {
  if (!line) return '';
  if (line.kind === 'addition') return '+';
  if (line.kind === 'deletion') return '−';
  if (line.kind === 'context') return ' ';
  return '';
}

function lineNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

function unifiedView(content: string): HTMLElement {
  const table = document.createElement('div');
  table.className = 'git-inline-diff-unified';

  parseUnifiedGitDiff(content).forEach((line) => {
    const row = document.createElement('div');
    row.className = `git-inline-diff-line is-${line.kind}`;

    const oldNumber = document.createElement('span');
    oldNumber.className = 'git-inline-diff-line-number';
    oldNumber.textContent = lineNumber(line.oldLine);
    const newNumber = document.createElement('span');
    newNumber.className = 'git-inline-diff-line-number';
    newNumber.textContent = lineNumber(line.newLine);
    const prefix = document.createElement('span');
    prefix.className = 'git-inline-diff-prefix';
    prefix.textContent = linePrefix(line);
    const code = document.createElement('code');
    code.textContent = line.text;

    row.append(oldNumber, newNumber, prefix, code);
    table.append(row);
  });

  return table;
}

function splitSide(line: GitUnifiedDiffLine | null, side: 'left' | 'right'): HTMLElement {
  const cell = document.createElement('div');
  cell.className = `git-inline-diff-side is-${side}${line ? ` is-${line.kind}` : ' is-empty'}`;

  const number = document.createElement('span');
  number.className = 'git-inline-diff-line-number';
  number.textContent = lineNumber(side === 'left' ? line?.oldLine ?? null : line?.newLine ?? null);
  const prefix = document.createElement('span');
  prefix.className = 'git-inline-diff-prefix';
  prefix.textContent = linePrefix(line);
  const code = document.createElement('code');
  code.textContent = line?.text ?? '';
  cell.append(number, prefix, code);
  return cell;
}

function splitView(content: string): HTMLElement {
  const table = document.createElement('div');
  table.className = 'git-inline-diff-split';

  buildSplitGitDiffRows(parseUnifiedGitDiff(content)).forEach((row) => {
    if (row.kind === 'meta') {
      const meta = document.createElement('div');
      const line = row.left ?? row.right;
      meta.className = `git-inline-diff-split-meta is-${line?.kind ?? 'meta'}`;
      const code = document.createElement('code');
      code.textContent = line?.text ?? '';
      meta.append(code);
      table.append(meta);
      return;
    }

    const pair = document.createElement('div');
    pair.className = `git-inline-diff-pair is-${row.kind}`;
    pair.append(splitSide(row.left, 'left'), splitSide(row.right, 'right'));
    table.append(pair);
  });

  return table;
}

function emptyView(message: string): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'git-inline-diff-empty';
  mountIcon(empty, DocumentTextIcon, 'git-inline-diff-empty-icon');
  const title = document.createElement('strong');
  title.textContent = 'Diff indisponível';
  const description = document.createElement('p');
  description.textContent = message;
  empty.append(title, description);
  return empty;
}

function renderViewer(
  viewer: HTMLElement,
  options: {
    filePath: string;
    previousPath: string;
    content: string;
    binary: boolean;
    close: () => void;
  },
): void {
  let mode = readViewMode();
  viewer.hidden = false;
  viewer.replaceChildren();

  const header = document.createElement('header');
  const heading = document.createElement('div');
  mountIcon(heading, DocumentTextIcon, 'git-inline-diff-heading-icon');
  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Diff do arquivo';
  const title = document.createElement('code');
  title.textContent = options.filePath;
  copy.append(eyebrow, title);
  if (options.previousPath && options.previousPath !== options.filePath) {
    const previous = document.createElement('small');
    previous.textContent = `Renomeado de ${options.previousPath}`;
    copy.append(previous);
  }
  heading.append(copy);

  const actions = document.createElement('div');
  actions.className = 'git-inline-diff-actions';
  const switcher = document.createElement('div');
  switcher.className = 'git-inline-diff-mode-switch';
  switcher.setAttribute('aria-label', 'Modo de visualização do diff');

  const body = document.createElement('div');
  body.className = 'git-inline-diff-body';

  const draw = (): void => {
    switcher.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    body.replaceChildren();
    if (options.binary) {
      body.append(emptyView('Arquivos binários não possuem visualização textual.'));
    } else if (!options.content.trim()) {
      body.append(emptyView('O patch deste arquivo não está disponível ou foi truncado.'));
    } else {
      body.append(mode === 'split' ? splitView(options.content) : unifiedView(options.content));
    }
  };

  const modeDefinitions: Array<{
    mode: DiffViewMode;
    label: string;
    icon: Parameters<typeof h>[0];
  }> = [
    { mode: 'unified', label: 'Unificado', icon: Bars3BottomLeftIcon },
    { mode: 'split', label: 'Lado a lado', icon: ViewColumnsIcon },
  ];

  modeDefinitions.forEach((definition) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = definition.mode;
    mountIcon(button, definition.icon, 'git-inline-diff-mode-icon');
    const label = document.createElement('span');
    label.textContent = definition.label;
    button.append(label);
    button.addEventListener('click', () => {
      mode = definition.mode;
      persistViewMode(mode);
      draw();
    });
    switcher.append(button);
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'git-inline-diff-close';
  close.title = 'Fechar diff do arquivo';
  close.setAttribute('aria-label', 'Fechar diff do arquivo');
  mountIcon(close, XMarkIcon, 'git-inline-diff-close-icon');
  close.addEventListener('click', options.close);
  actions.append(switcher, close);
  header.append(heading, actions);
  viewer.append(header, body);
  draw();
}

function pathsFromRow(row: HTMLElement): { filePath: string; previousPath: string } | null {
  const code = row.querySelector('code');
  const text = code?.textContent?.trim() ?? '';
  if (!text) return null;
  const parts = text.split(' → ').map((part) => part.trim()).filter(Boolean);
  return {
    filePath: parts.at(-1) ?? text,
    previousPath: parts.length > 1 ? parts[0] ?? '' : '',
  };
}

function updateFullDiffLabel(container: HTMLElement, selector: string): void {
  const summary = container.querySelector<HTMLElement>(selector);
  const labels = Array.from(summary?.querySelectorAll<HTMLElement>('span') ?? []);
  const label = labels.find((candidate) => candidate.textContent?.includes('diff completo'));
  if (label) label.textContent = 'Ver diff completo (todos os arquivos)';
}

function enhanceDetail(container: HTMLElement, configuration: DetailConfiguration): void {
  const files = container.querySelector<HTMLElement>(configuration.files);
  const patch = container.querySelector<HTMLElement>(configuration.patch);
  if (!files || !patch || files.dataset.inlineFileDiff === 'true') return;
  files.dataset.inlineFileDiff = 'true';

  const viewer = document.createElement('section');
  viewer.className = 'git-inline-file-diff';
  viewer.hidden = true;
  files.after(viewer);

  let activeRow: HTMLElement | null = null;
  const close = (): void => {
    viewer.hidden = true;
    viewer.replaceChildren();
    activeRow?.classList.remove('is-diff-active');
    activeRow = null;
  };

  files.querySelectorAll<HTMLElement>('ul > li').forEach((row) => {
    const paths = pathsFromRow(row);
    if (!paths) return;
    row.classList.add('git-inline-file-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Ver diff de ${paths.filePath}`);
    mountIcon(row, ChevronRightIcon, 'git-inline-file-row-chevron');

    const open = (): void => {
      const filePatch = findGitPatchForFile(rawPatchOf(patch), paths.filePath, paths.previousPath);
      activeRow?.classList.remove('is-diff-active');
      activeRow = row;
      row.classList.add('is-diff-active');
      renderViewer(viewer, {
        filePath: paths.filePath,
        previousPath: paths.previousPath,
        content: filePatch?.content ?? '',
        binary: row.querySelector('small')?.textContent?.toLocaleLowerCase('pt-BR').includes('binário') ?? false,
        close,
      });
      viewer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });

  updateFullDiffLabel(container, configuration.fullDiffSummary);
}

export function scanDetails(root: ParentNode): void {
  configurations.forEach((configuration) => {
    if (root instanceof HTMLElement && root.matches(configuration.container)) {
      enhanceDetail(root, configuration);
    }
    root.querySelectorAll<HTMLElement>(configuration.container).forEach((container) => {
      enhanceDetail(container, configuration);
    });
  });
}

function commitFilePath(button: HTMLElement): string {
  const row = button.closest('li');
  const codes = Array.from(row?.querySelectorAll('code') ?? []);
  const text = codes.at(-1)?.textContent?.trim() ?? '';
  return text.split(' → ').at(-1)?.trim() ?? text;
}

function rememberCommitFile(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>('.git-commit-file-diff');
  if (!button) return;
  const filePath = commitFilePath(button);
  if (!filePath) return;
  try {
    window.sessionStorage.setItem(TARGET_FILE_KEY, JSON.stringify({
      filePath,
      createdAt: Date.now(),
    }));
  } catch {
    // A navegação para a aba Diff continua funcionando sem persistência.
  }
}

function openRememberedDiffFile(): void {
  let target: { filePath?: string; createdAt?: number } | null = null;
  try {
    const raw = window.sessionStorage.getItem(TARGET_FILE_KEY);
    target = raw ? JSON.parse(raw) as { filePath?: string; createdAt?: number } : null;
  } catch {
    target = null;
  }
  if (!target?.filePath || Date.now() - (target.createdAt ?? 0) > 30_000) {
    try { window.sessionStorage.removeItem(TARGET_FILE_KEY); } catch { /* noop */ }
    return;
  }

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-git-diff-path]'));
  const button = buttons.find((candidate) => candidate.dataset.gitDiffPath === target?.filePath);
  if (!button) return;
  try { window.sessionStorage.removeItem(TARGET_FILE_KEY); } catch { /* noop */ }
  button.click();
  button.focus({ preventScroll: true });
  button.scrollIntoView({ block: 'nearest' });
}

function scan(root: ParentNode = document): void {
  scanDetails(root);
  openRememberedDiffFile();
}

export function installGitInlineFileDiffEnhancer(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', rememberCommitFile, true);
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
